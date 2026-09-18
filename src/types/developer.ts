import { GameTheme } from '../themes/types';

export interface PlatformGame {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  game_type: string;
  description: string | null;
  icon_name: string;
  status: 'active' | 'inactive' | 'draft' | 'archived';
  is_system: boolean;
  ownership_type: 'system' | 'organization';
  background_url: string | null;
  basket_config: any;
  items_config: any;
  settings_config: any;
  theme_count?: number;
  system_theme_count?: number;
  events_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformStats {
  totalGames: number;
  activeGames: number;
  totalDefaultThemes: number;
  activeThemes: number;
}

export interface EventPricingRule {
  id: string;
  min_days: number;
  max_days: number | null; // null = unlimited (e.g., 91+ days)
  price: number;
  currency: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformPricingSettings {
  default_price: number;
  default_currency: string;
  pricing_rules?: EventPricingRule[];
  updated_at?: string;
  updated_by?: string | null;
}

export interface PlatformContactSettings {
  whatsapp_number: string;
  whatsapp_display: string;
  whatsapp_prefill_message: string;
  enquiry_email: string;
  support_hours: string;
  office_location: string;
  updated_at?: string;
  updated_by?: string | null;
}

export interface ContactEnquiry {
  id: string;
  ticket_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  category: string;
  event_date: string | null;
  expected_attendees: string | null;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  email_status: 'pending' | 'sent' | 'failed' | 'not_configured';
  email_message_id: string | null;
  email_error: string | null;
  created_at: string;
}

export interface AdminEventPricingItem {
  id: string;
  organization_id: string;
  organization_name?: string;
  organization_slug?: string;
  name: string;
  slug: string;
  status: string;
  event_status?: string;
  payment_status?: string;
  cancel_reason?: string | null;
  event_price?: number;
  event_currency?: string;
  effective_price: number;
  is_custom_price: boolean;
  game_type?: string;
  theme_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  duration_days?: number;
  created_at: string;
}
