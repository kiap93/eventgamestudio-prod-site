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

export interface PlatformPricingSettings {
  default_price: number;
  default_currency: string;
  updated_at?: string;
  updated_by?: string | null;
}

export interface AdminEventPricingItem {
  id: string;
  organization_id: string;
  organization_name?: string;
  organization_slug?: string;
  name: string;
  slug: string;
  status: string;
  payment_status?: string;
  event_price?: number;
  event_currency?: string;
  effective_price: number;
  is_custom_price: boolean;
  game_type?: string;
  theme_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}
