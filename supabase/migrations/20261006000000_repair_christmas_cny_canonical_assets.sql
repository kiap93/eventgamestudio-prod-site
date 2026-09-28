-- Migration: 20261006000000_repair_christmas_cny_canonical_assets.sql
-- Description: Repairs existing system theme asset paths for Christmas, Lunar New Year (CNY), and Carnival to canonical filesystem locations.

UPDATE public.game_themes
SET
  background_url = '/assets/games/catch-brand/themes/christmas/background.png',
  basket_config = jsonb_set(
    COALESCE(basket_config, '{}'::jsonb),
    '{imageUrl}',
    '"/assets/games/catch-brand/themes/christmas/basket.png"'
  ),
  items_config = jsonb_build_array(
    jsonb_build_object(
      'id', 'gift_box',
      'name', 'Christmas Present',
      'imageUrl', '/assets/games/catch-brand/themes/christmas/item_normal_01.png',
      'points', 10,
      'speedMultiplier', 1.0,
      'spawnWeight', 75,
      'enabled', true,
      'isHazard', false,
      'isBonus', false
    ),
    jsonb_build_object(
      'id', 'coal_lump',
      'name', 'Naughty Snowball',
      'imageUrl', '/assets/games/catch-brand/themes/christmas/item_hazard_01.png',
      'points', -10,
      'speedMultiplier', 1.2,
      'spawnWeight', 20,
      'enabled', true,
      'isHazard', true,
      'isBonus', false
    ),
    jsonb_build_object(
      'id', 'golden_star',
      'name', 'Golden Star',
      'imageUrl', '/assets/games/catch-brand/themes/christmas/item_bonus_01.png',
      'points', 50,
      'speedMultiplier', 1.35,
      'spawnWeight', 5,
      'enabled', true,
      'isHazard', false,
      'isBonus', true
    )
  ),
  updated_at = NOW()
WHERE slug IN ('christmas-rush', 'christmas')
  AND (is_system = TRUE OR organization_id IS NULL);

UPDATE public.game_themes
SET
  background_url = '/assets/games/catch-brand/themes/cny/background.png',
  basket_config = jsonb_set(
    COALESCE(basket_config, '{}'::jsonb),
    '{imageUrl}',
    '"/assets/games/catch-brand/themes/cny/basket.png"'
  ),
  items_config = jsonb_build_array(
    jsonb_build_object(
      'id', 'red_packet',
      'name', 'Red Packet (Angpow)',
      'imageUrl', '/assets/games/catch-brand/themes/cny/item_normal_01.png',
      'points', 10,
      'speedMultiplier', 1.0,
      'spawnWeight', 75,
      'enabled', true,
      'isHazard', false,
      'isBonus', false
    ),
    jsonb_build_object(
      'id', 'firecracker',
      'name', 'Exploding Firecracker',
      'imageUrl', '/assets/games/catch-brand/themes/cny/item_hazard_01.png',
      'points', -10,
      'speedMultiplier', 1.25,
      'spawnWeight', 20,
      'enabled', true,
      'isHazard', true,
      'isBonus', false
    ),
    jsonb_build_object(
      'id', 'gold_ingot',
      'name', 'Gold Ingot (Yuanbao)',
      'imageUrl', '/assets/games/catch-brand/themes/cny/item_bonus_01.png',
      'points', 50,
      'speedMultiplier', 1.3,
      'spawnWeight', 5,
      'enabled', true,
      'isHazard', false,
      'isBonus', true
    )
  ),
  updated_at = NOW()
WHERE slug IN ('cny-fortune', 'chinese-new-year', 'cny')
  AND (is_system = TRUE OR organization_id IS NULL);

UPDATE public.game_themes
SET
  background_url = '/assets/games/catch-brand/themes/carnival/background.png',
  basket_config = jsonb_set(
    COALESCE(basket_config, '{}'::jsonb),
    '{imageUrl}',
    '"/assets/games/catch-brand/themes/carnival/basket.png"'
  ),
  items_config = jsonb_build_array(
    jsonb_build_object(
      'id', 'ticket',
      'name', 'Golden Carnival Ticket',
      'imageUrl', '/assets/games/catch-brand/themes/carnival/item_normal_01.png',
      'points', 10,
      'speedMultiplier', 1.0,
      'spawnWeight', 75,
      'enabled', true,
      'isHazard', false,
      'isBonus', false
    ),
    jsonb_build_object(
      'id', 'mask',
      'name', 'Carnival Cursed Mask',
      'imageUrl', '/assets/games/catch-brand/themes/carnival/item_hazard_01.png',
      'points', -10,
      'speedMultiplier', 1.15,
      'spawnWeight', 20,
      'enabled', true,
      'isHazard', true,
      'isBonus', false
    ),
    jsonb_build_object(
      'id', 'star',
      'name', 'Cosmic Carnival Star',
      'imageUrl', '/assets/games/catch-brand/themes/carnival/item_bonus_01.png',
      'points', 50,
      'speedMultiplier', 1.3,
      'spawnWeight', 5,
      'enabled', true,
      'isHazard', false,
      'isBonus', true
    )
  ),
  updated_at = NOW()
WHERE slug IN ('carnival', 'carnival-fiesta')
  AND (is_system = TRUE OR organization_id IS NULL);
