import { GameTheme } from '../../themes/types';
import { MemoryCard } from './types';

interface CardPrototype {
  pairId: string;
  name: string;
  imageUrl?: string | null;
  iconName?: string;
  color: string;
  bgColor: string;
  borderColor: string;
  points: number;
}

// 8 Default Carnival themed card prototypes with rich colors and icons
const DEFAULT_CARD_PROTOTYPES: CardPrototype[] = [
  {
    pairId: 'pair_ticket',
    name: 'Golden Ticket',
    imageUrl: '/assets/themes/carnival/item_normal_01.png',
    iconName: 'Ticket',
    color: '#fbbf24', // amber-400
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    points: 100,
  },
  {
    pairId: 'pair_mask',
    name: 'Carnival Mask',
    imageUrl: '/assets/themes/carnival/item_hazard_01.png',
    iconName: 'Sparkles',
    color: '#f43f5e', // rose-500
    bgColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: '#f43f5e',
    points: 100,
  },
  {
    pairId: 'pair_star',
    name: 'Cosmic Star',
    imageUrl: '/assets/themes/carnival/item_bonus_01.png',
    iconName: 'Star',
    color: '#eab308', // yellow-500
    bgColor: 'rgba(234, 179, 8, 0.15)',
    borderColor: '#eab308',
    points: 100,
  },
  {
    pairId: 'pair_cart',
    name: 'Carnival Cart',
    imageUrl: '/assets/themes/carnival/basket.png',
    iconName: 'ShoppingBag',
    color: '#10b981', // emerald-500
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    points: 100,
  },
  {
    pairId: 'pair_circus',
    name: 'Big Top Tent',
    imageUrl: null,
    iconName: 'Tent',
    color: '#8b5cf6', // violet-500
    bgColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8b5cf6',
    points: 100,
  },
  {
    pairId: 'pair_balloon',
    name: 'Party Balloons',
    imageUrl: null,
    iconName: 'PartyPopper',
    color: '#ec4899', // pink-500
    bgColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: '#ec4899',
    points: 100,
  },
  {
    pairId: 'pair_trophy',
    name: 'Carnival Cup',
    imageUrl: null,
    iconName: 'Trophy',
    color: '#06b6d4', // cyan-500
    bgColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
    points: 100,
  },
  {
    pairId: 'pair_wheel',
    name: 'Fortune Wheel',
    imageUrl: null,
    iconName: 'Disc',
    color: '#f97316', // orange-500
    bgColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: '#f97316',
    points: 100,
  },
];

/**
 * Fisher-Yates shuffle algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds 8 unique pairs tailored to the given theme, duplicates them to 16 cards,
 * and shuffles them randomly.
 */
export function createShuffledDeck(theme?: GameTheme | null): MemoryCard[] {
  const prototypes: CardPrototype[] = [];

  // If the active theme has custom drop items, prioritize them
  if (theme?.items_config && theme.items_config.length > 0) {
    theme.items_config.forEach((item, index) => {
      if (prototypes.length < 8 && item.enabled !== false) {
        prototypes.push({
          pairId: `pair_item_${item.id || index}`,
          name: item.name || `Item ${index + 1}`,
          imageUrl: item.imageUrl || null,
          iconName: item.isBonus ? 'Star' : item.isHazard ? 'Flame' : 'Gift',
          color: item.isBonus ? '#eab308' : item.isHazard ? '#f43f5e' : '#10b981',
          bgColor: item.isBonus ? 'rgba(234, 179, 8, 0.15)' : item.isHazard ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          borderColor: item.isBonus ? '#eab308' : item.isHazard ? '#f43f5e' : '#10b981',
          points: 100,
        });
      }
    });
  }

  // Include basket/catcher if we still need more pairs
  if (prototypes.length < 8 && theme?.basket_config) {
    prototypes.push({
      pairId: 'pair_basket',
      name: theme.basket_config.name || 'Catcher',
      imageUrl: theme.basket_config.imageUrl || null,
      iconName: 'ShoppingBag',
      color: '#38bdf8',
      bgColor: 'rgba(56, 189, 248, 0.15)',
      borderColor: '#38bdf8',
      points: 100,
    });
  }

  // Backfill with default carnival prototypes to guarantee exactly 8 unique pairs
  for (const def of DEFAULT_CARD_PROTOTYPES) {
    if (prototypes.length >= 8) break;
    if (!prototypes.some((p) => p.name.toLowerCase() === def.name.toLowerCase())) {
      prototypes.push({ ...def });
    }
  }

  // Ensure we have exactly 8 prototypes
  const final8 = prototypes.slice(0, 8);

  // Duplicate each prototype into 2 card instances (16 cards total)
  const cards: MemoryCard[] = [];
  final8.forEach((proto, index) => {
    // Card A
    cards.push({
      id: `card_${index}_a`,
      pairId: proto.pairId,
      name: proto.name,
      imageUrl: proto.imageUrl,
      iconName: proto.iconName,
      color: proto.color,
      bgColor: proto.bgColor,
      borderColor: proto.borderColor,
      points: proto.points,
      isFlipped: false,
      isMatched: false,
      isShaking: false,
    });

    // Card B
    cards.push({
      id: `card_${index}_b`,
      pairId: proto.pairId,
      name: proto.name,
      imageUrl: proto.imageUrl,
      iconName: proto.iconName,
      color: proto.color,
      bgColor: proto.bgColor,
      borderColor: proto.borderColor,
      points: proto.points,
      isFlipped: false,
      isMatched: false,
      isShaking: false,
    });
  });

  return shuffleArray(cards);
}
