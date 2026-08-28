import { GameTheme, getMemoryMatchConfig } from '../../themes/types';
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

// 8 Default Memory Match card prototypes with geometric symbols and icons
const DEFAULT_CARD_PROTOTYPES: CardPrototype[] = [
  {
    pairId: 'pair_diamond',
    name: 'Diamond',
    imageUrl: null,
    iconName: 'Sparkles',
    color: '#6366f1', // indigo-500
    bgColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: '#6366f1',
    points: 100,
  },
  {
    pairId: 'pair_crown',
    name: 'Crown',
    imageUrl: null,
    iconName: 'Award',
    color: '#eab308', // yellow-500
    bgColor: 'rgba(234, 179, 8, 0.15)',
    borderColor: '#eab308',
    points: 100,
  },
  {
    pairId: 'pair_star',
    name: 'Star',
    imageUrl: null,
    iconName: 'Star',
    color: '#f59e0b', // amber-500
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    points: 100,
  },
  {
    pairId: 'pair_heart',
    name: 'Heart',
    imageUrl: null,
    iconName: 'Gift',
    color: '#ec4899', // pink-500
    bgColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: '#ec4899',
    points: 100,
  },
  {
    pairId: 'pair_lightning',
    name: 'Lightning',
    imageUrl: null,
    iconName: 'Zap',
    color: '#38bdf8', // sky-400
    bgColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
    points: 100,
  },
  {
    pairId: 'pair_shield',
    name: 'Shield',
    imageUrl: null,
    iconName: 'Medal',
    color: '#10b981', // emerald-500
    bgColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    points: 100,
  },
  {
    pairId: 'pair_trophy',
    name: 'Trophy',
    imageUrl: null,
    iconName: 'Trophy',
    color: '#a855f7', // purple-500
    bgColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#a855f7',
    points: 100,
  },
  {
    pairId: 'pair_rocket',
    name: 'Rocket',
    imageUrl: null,
    iconName: 'Flame',
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
 * Prioritizes game_config.pairs as the authoritative source of truth.
 */
export function createShuffledDeck(theme?: GameTheme | null): MemoryCard[] {
  const memoryConfig = getMemoryMatchConfig(theme);
  const prototypes: CardPrototype[] = [];

  if (memoryConfig.pairs && memoryConfig.pairs.length > 0) {
    memoryConfig.pairs.forEach((pair, index) => {
      if (prototypes.length < 8) {
        const fallbackProto = DEFAULT_CARD_PROTOTYPES[index % DEFAULT_CARD_PROTOTYPES.length];
        prototypes.push({
          pairId: pair.id || `pair_${index}`,
          name: pair.name || fallbackProto.name,
          imageUrl: pair.imageUrl || null,
          iconName: pair.iconName || fallbackProto.iconName,
          color: pair.color || fallbackProto.color,
          bgColor: pair.bgColor || fallbackProto.bgColor,
          borderColor: pair.borderColor || fallbackProto.borderColor,
          points: pair.points ?? 100,
        });
      }
    });
  }

  // Backfill with default Memory Match card prototypes to guarantee exactly 8 unique pairs
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

