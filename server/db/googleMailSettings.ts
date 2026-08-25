import { getSupabaseServerClient, isSupabaseConfigured } from '../supabase.js';
import { GoogleMailSettingsRecord } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_GMAIL_SETTINGS_FILE = path.join(process.cwd(), 'uploads', 'google_mail_settings.json');

let localGmailSettingsCache: GoogleMailSettingsRecord | null = null;

function loadLocalGmailSettings(): void {
  try {
    if (fs.existsSync(LOCAL_GMAIL_SETTINGS_FILE)) {
      const raw = fs.readFileSync(LOCAL_GMAIL_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        localGmailSettingsCache = parsed;
      }
    }
  } catch (err) {
    console.warn('Warning loading local Google Mail settings:', err);
  }
}

function saveLocalGmailSettings(): void {
  try {
    const dir = path.dirname(LOCAL_GMAIL_SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (localGmailSettingsCache) {
      fs.writeFileSync(
        LOCAL_GMAIL_SETTINGS_FILE,
        JSON.stringify(localGmailSettingsCache, null, 2),
        'utf-8'
      );
    } else if (fs.existsSync(LOCAL_GMAIL_SETTINGS_FILE)) {
      fs.unlinkSync(LOCAL_GMAIL_SETTINGS_FILE);
    }
  } catch (err) {
    console.warn('Warning saving local Google Mail settings:', err);
  }
}

loadLocalGmailSettings();

/**
 * Get active platform-level Google Mail settings.
 * Returns null if no active Gmail connection exists.
 */
export async function getGoogleMailSettings(
  env?: Record<string, any>
): Promise<GoogleMailSettingsRecord | null> {
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('google_mail_settings')
        .select('*')
        .eq('provider', 'google_mail')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          provider: 'google_mail',
          email_address: data.email_address,
          refresh_token_encrypted: data.refresh_token_encrypted,
          enabled: data.enabled !== false,
          status: data.status || 'connected',
          last_error: data.last_error || null,
          last_connected_at: data.last_connected_at || data.created_at,
          created_at: data.created_at,
          updated_at: data.updated_at,
          connected_by: data.connected_by || null,
        };
      }
    } catch (err) {
      console.warn('Notice loading google_mail_settings from Supabase, using local fallback:', err);
    }
  }

  return localGmailSettingsCache;
}

/**
 * Save or update platform-level Google Mail settings.
 */
export async function saveGoogleMailSettings(
  settings: {
    email_address: string;
    refresh_token_encrypted: string;
    connected_by?: string | null;
    enabled?: boolean;
    status?: 'connected' | 'error' | 'disconnected';
    last_error?: string | null;
  },
  env?: Record<string, any>
): Promise<GoogleMailSettingsRecord> {
  const now = new Date().toISOString();
  const existing = await getGoogleMailSettings(env);
  const id = existing?.id || 'platform-google-mail-primary';

  const record: GoogleMailSettingsRecord = {
    id,
    provider: 'google_mail',
    email_address: settings.email_address.trim().toLowerCase(),
    refresh_token_encrypted: settings.refresh_token_encrypted,
    enabled: settings.enabled !== undefined ? settings.enabled : true,
    status: settings.status || 'connected',
    last_error: settings.last_error || null,
    last_connected_at: now,
    created_at: existing?.created_at || now,
    updated_at: now,
    connected_by: settings.connected_by || existing?.connected_by || null,
  };

  localGmailSettingsCache = record;
  saveLocalGmailSettings();

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('google_mail_settings')
        .upsert(
          {
            id: record.id,
            provider: record.provider,
            email_address: record.email_address,
            refresh_token_encrypted: record.refresh_token_encrypted,
            enabled: record.enabled,
            status: record.status,
            last_error: record.last_error,
            last_connected_at: record.last_connected_at,
            created_at: record.created_at,
            updated_at: record.updated_at,
            connected_by: record.connected_by,
          },
          { onConflict: 'provider' }
        );

      if (error) {
        console.warn('Notice saving google_mail_settings to Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Notice saving google_mail_settings to Supabase:', err);
    }
  }

  return record;
}

/**
 * Disconnect the platform-level Google Mail integration.
 */
export async function disconnectGoogleMail(env?: Record<string, any>): Promise<void> {
  const existing = await getGoogleMailSettings(env);
  const now = new Date().toISOString();

  if (existing) {
    localGmailSettingsCache = {
      ...existing,
      enabled: false,
      status: 'disconnected',
      refresh_token_encrypted: '',
      updated_at: now,
    };
    saveLocalGmailSettings();
  } else {
    localGmailSettingsCache = null;
    saveLocalGmailSettings();
  }

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase
        .from('google_mail_settings')
        .update({
          enabled: false,
          status: 'disconnected',
          refresh_token_encrypted: '',
          updated_at: now,
        })
        .eq('provider', 'google_mail');
    } catch (err) {
      console.warn('Notice updating google_mail_settings disconnect in Supabase:', err);
    }
  }
}

/**
 * Update the status / error of the platform Google Mail connection.
 */
export async function updateGoogleMailStatus(
  status: 'connected' | 'error' | 'disconnected',
  lastError?: string | null,
  env?: Record<string, any>
): Promise<void> {
  const existing = await getGoogleMailSettings(env);
  if (!existing) return;

  const now = new Date().toISOString();
  existing.status = status;
  existing.last_error = lastError || null;
  existing.updated_at = now;

  localGmailSettingsCache = existing;
  saveLocalGmailSettings();

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase
        .from('google_mail_settings')
        .update({
          status,
          last_error: lastError || null,
          updated_at: now,
        })
        .eq('id', existing.id);
    } catch (err) {
      console.warn('Notice updating google_mail_settings status in Supabase:', err);
    }
  }
}
