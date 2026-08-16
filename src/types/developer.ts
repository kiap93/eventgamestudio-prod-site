import { GameTheme } from '../themes/types';

export interface PlatformGame {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  game_type: string;
  description: string | null;
  icon_name: string;
  status: 'active' | 'draft' | 'archived';
  is_system: boolean;
  ownership_type: 'system' | 'organization';
  background_url: string | null;
  basket_config: any;
  items_config: any;
  settings_config: any;
  theme_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformStats {
  totalGames: number;
  activeGames: number;
  totalDefaultThemes: number;
  activeThemes: number;
}
