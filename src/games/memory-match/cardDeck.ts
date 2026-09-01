import { GameTheme, getMemoryMatchConfig } from '../../themes/types';
import {
  MemoryCard,
  MemoryMatchPairConfig,
  MIN_BOARD_ROWS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLS,
  MAX_BOARD_COLS,
} from './types';

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

// 20 Rich Memory Match card prototypes with geometric symbols and icons
export const DEFAULT_CARD_PROTOTYPES: CardPrototype[] = [
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
  {
    pairId: 'pair_gem',
    name: 'Gem',
    imageUrl: null,
    iconName: 'Sparkles',
    color: '#06b6d4', // cyan-500
    bgColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
    points: 100,
  },
  {
    pairId: 'pair_target',
    name: 'Target',
    imageUrl: null,
    iconName: 'Disc',
    color: '#f43f5e', // rose-500
    bgColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: '#f43f5e',
    points: 100,
  },
  {
    pairId: 'pair_party',
    name: 'Party Popper',
    imageUrl: null,
    iconName: 'PartyPopper',
    color: '#8b5cf6', // violet-500
    bgColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8b5cf6',
    points: 100,
  },
  {
    pairId: 'pair_tent',
    name: 'Carnival Tent',
    imageUrl: null,
    iconName: 'Tent',
    color: '#ef4444', // red-500
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    points: 100,
  },
  {
    pairId: 'pair_ticket',
    name: 'Golden Ticket',
    imageUrl: null,
    iconName: 'Ticket',
    color: '#eab308', // yellow-500
    bgColor: 'rgba(234, 179, 8, 0.15)',
    borderColor: '#eab308',
    points: 100,
  },
  {
    pairId: 'pair_bag',
    name: 'Mystery Bag',
    imageUrl: null,
    iconName: 'ShoppingBag',
    color: '#14b8a6', // teal-500
    bgColor: 'rgba(20, 184, 166, 0.15)',
    borderColor: '#14b8a6',
    points: 100,
  },
  {
    pairId: 'pair_moon',
    name: 'Crescent Moon',
    imageUrl: null,
    iconName: 'Sparkles',
    color: '#c084fc', // purple-400
    bgColor: 'rgba(192, 132, 252, 0.15)',
    borderColor: '#c084fc',
    points: 100,
  },
  {
    pairId: 'pair_sun',
    name: 'Solar Sun',
    imageUrl: null,
    iconName: 'Star',
    color: '#facc15', // yellow-400
    bgColor: 'rgba(250, 204, 21, 0.15)',
    borderColor: '#facc15',
    points: 100,
  },
  {
    pairId: 'pair_ring',
    name: 'Power Ring',
    imageUrl: null,
    iconName: 'Disc',
    color: '#38bdf8', // sky-400
    bgColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
    points: 100,
  },
  {
    pairId: 'pair_badge',
    name: 'Honor Badge',
    imageUrl: null,
    iconName: 'Award',
    color: '#fb923c', // orange-400
    bgColor: 'rgba(251, 146, 60, 0.15)',
    borderColor: '#fb923c',
    points: 100,
  },
  {
    pairId: 'pair_medal',
    name: 'Champion Medal',
    imageUrl: null,
    iconName: 'Medal',
    color: '#4ade80', // green-400
    bgColor: 'rgba(74, 222, 128, 0.15)',
    borderColor: '#4ade80',
    points: 100,
  },
  {
    pairId: 'pair_blaze',
    name: 'Blaze Torch',
    imageUrl: null,
    iconName: 'Flame',
    color: '#fb7185', // rose-400
    bgColor: 'rgba(251, 113, 133, 0.15)',
    borderColor: '#fb7185',
    points: 100,
  },
];

/**
 * Ensures a pair configuration array contains at least requiredPairsCount,
 * preserving all existing pairs and safely backfilling any missing slots.
 */
export function ensureRequiredPairs(
  existingPairs: MemoryMatchPairConfig[] | undefined,
  requiredPairsCount: number
): MemoryMatchPairConfig[] {
  const current = existingPairs && Array.isArray(existingPairs) ? [...existingPairs] : [];
  if (current.length >= requiredPairsCount) {
    return current;
  }

  for (let i = current.length; i < requiredPairsCount; i++) {
    const proto = DEFAULT_CARD_PROTOTYPES[i % DEFAULT_CARD_PROTOTYPES.length];
    current.push({
      id: proto.pairId || `pair_${i + 1}`,
      name: proto.name || `Card Pair ${i + 1}`,
      imageUrl: null,
      points: 100,
      iconName: proto.iconName,
      color: proto.color,
      bgColor: proto.bgColor,
      borderColor: proto.borderColor,
    });
  }

  return current;
}

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
 * Builds unique pairs tailored to the given theme and board dimensions (rows × cols),
 * duplicates them into matching card pairs, and shuffles them randomly.
 * Prioritizes game_config.pairs as the authoritative source of truth.
 */
export function createShuffledDeck(theme?: GameTheme | null): MemoryCard[] {
  const memoryConfig = getMemoryMatchConfig(theme);
  const rows = Math.max(MIN_BOARD_ROWS, Math.min(MAX_BOARD_ROWS, memoryConfig.board?.rows ?? memoryConfig.grid?.rows ?? 4));
  const cols = Math.max(MIN_BOARD_COLS, Math.min(MAX_BOARD_COLS, memoryConfig.board?.cols ?? memoryConfig.grid?.cols ?? 4));
  const totalCards = (rows * cols) % 2 === 0 ? rows * cols : rows * cols - 1;
  const requiredPairsCount = Math.max(1, Math.floor(totalCards / 2));

  const prototypes: CardPrototype[] = [];

  if (memoryConfig.pairs && memoryConfig.pairs.length > 0) {
    memoryConfig.pairs.forEach((pair, index) => {
      if (prototypes.length < requiredPairsCount) {
        const fallbackProto = DEFAULT_CARD_PROTOTYPES[index % DEFAULT_CARD_PROTOTYPES.length];
        prototypes.push({
          pairId: pair.id || `pair_${index + 1}`,
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

  // Backfill with default prototypes to guarantee the exact required pair count
  for (let i = 0; i < DEFAULT_CARD_PROTOTYPES.length; i++) {
    if (prototypes.length >= requiredPairsCount) break;
    const def = DEFAULT_CARD_PROTOTYPES[i];
    if (!prototypes.some((p) => p.pairId === def.pairId || p.name.toLowerCase() === def.name.toLowerCase())) {
      prototypes.push({ ...def });
    }
  }

  // If still short of required pairs (e.g. for very large custom boards), generate dynamically
  let genIndex = prototypes.length + 1;
  while (prototypes.length < requiredPairsCount) {
    const fallbackProto = DEFAULT_CARD_PROTOTYPES[genIndex % DEFAULT_CARD_PROTOTYPES.length];
    prototypes.push({
      pairId: `pair_gen_${genIndex}`,
      name: `Card Pair ${genIndex}`,
      imageUrl: null,
      iconName: fallbackProto.iconName,
      color: fallbackProto.color,
      bgColor: fallbackProto.bgColor,
      borderColor: fallbackProto.borderColor,
      points: 100,
    });
    genIndex++;
  }

  // Take exactly requiredPairsCount prototypes
  const activePrototypes = prototypes.slice(0, requiredPairsCount);

  // Duplicate each prototype into 2 card instances (totalCards total)
  const cards: MemoryCard[] = [];
  const cardConfig = memoryConfig.card || memoryConfig.board?.card;
  const rotationMode = cardConfig?.rotationMode || 'none';
  const fixedAngle = cardConfig?.rotation || 0;
  const randomAngleRange = cardConfig?.rotationRange ?? 8;

  activePrototypes.forEach((proto, index) => {
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

  const shuffled = shuffleArray(cards);

  // Assign deterministic, stable rotation angles per card
  return shuffled.map((card) => {
    let rotation = 0;
    if (rotationMode === 'fixed') {
      rotation = fixedAngle;
    } else if (rotationMode === 'random') {
      rotation = Math.round(((Math.random() * 2 - 1) * randomAngleRange) * 10) / 10;
    }
    return {
      ...card,
      rotation,
    };
  });
}

