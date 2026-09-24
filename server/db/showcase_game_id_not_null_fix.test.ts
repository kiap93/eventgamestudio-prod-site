import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Showcase game_id NOT NULL constraint fix', () => {
  it('should ensure schema.sql and migrations populate game_id in publish_event_showcase_atomic and save_event_showcase_atomic', () => {
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/schema.sql'), 'utf-8');
    const migration20260929 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260929000000_fix_showcase_service_role_trigger.sql'),
      'utf-8'
    );
    const migration20261001 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261001000000_ensure_showcase_game_id_and_atomic_rpcs.sql'),
      'utf-8'
    );

    // Verify migration 20261001 exists and has alter column game_id drop not null
    assert.ok(migration20261001.includes('ALTER TABLE public.event_showcases ALTER COLUMN game_id DROP NOT NULL'));
    assert.ok(migration20261001.includes('v_game_id := COALESCE('));
    assert.ok(migration20261001.includes('v_event.game_id'));

    // Check schema.sql has game_id in event_showcases
    assert.ok(schemaSql.includes('ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS game_id UUID'));
    assert.ok(schemaSql.includes('ALTER TABLE public.event_showcases ALTER COLUMN game_id DROP NOT NULL'));

    // Check schema.sql publish_event_showcase_atomic includes game_id in SELECT and INSERT
    assert.match(schemaSql, /SELECT\s+id,\s+organization_id,\s+game_id/);
    assert.ok(schemaSql.includes('game_id = COALESCE(v_existing.game_id, v_game_id)'));

    // Check 20260929 migration includes game_id in SELECT and INSERT
    assert.match(migration20260929, /SELECT\s+id,\s+organization_id,\s+game_id/);
    assert.ok(migration20260929.includes('game_id = COALESCE(v_existing.game_id, v_game_id)'));
  });

  it('should verify showcases.ts passes game_id in payload and fallback insert', () => {
    const showcasesTs = fs.readFileSync(path.resolve(process.cwd(), 'server/db/showcases.ts'), 'utf-8');

    // Verify resolvedGameId is retrieved from event or theme
    assert.ok(showcasesTs.includes('const resolvedGameId = event.game_id || (event.game_theme_id ? (await getThemeById(event.game_theme_id, env))?.game_id : undefined);'));
    assert.ok(showcasesTs.includes('payload.game_id = resolvedGameId;'));

    // Verify direct fallback insert also sets game_id
    assert.ok(showcasesTs.includes("isMissingColumnError(insertErr, 'game_id')"));
    assert.ok(showcasesTs.includes("isMissingColumnError(insertError, 'game_id')"));
  });

  it('should verify EventShowcaseRecord type includes game_id', () => {
    const typesTs = fs.readFileSync(path.resolve(process.cwd(), 'server/db/types.ts'), 'utf-8');
    assert.ok(typesTs.includes('game_id?: string | null;'));
  });
});
