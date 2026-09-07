import { ResultScreenElementType } from '../../../../games/memory-match/types';

export type ResultElementCategory = 'container' | 'visual' | 'stat' | 'control';

export interface ResultElementDefinition {
  type: ResultScreenElementType;
  label: string;
  category: ResultElementCategory;
  description?: string;
  badge?: string;
}

/**
 * Result screen elements for Catch The Brand arcade games
 */
export const CATCH_BRAND_RESULT_ELEMENTS: ResultElementDefinition[] = [
  // Containers
  { type: 'card', label: 'Card Container', category: 'container', description: 'Framed card container for grouping elements' },
  { type: 'group', label: 'Group Wrapper', category: 'container', description: 'Invisible group wrapper for layered positioning' },
  // Visual Elements
  { type: 'text', label: 'Text Block', category: 'visual', description: 'Headline, victory title, or custom message' },
  { type: 'image', label: 'Image / Icon', category: 'visual', description: 'Custom logo, trophy badge, or celebration artwork' },
  // Live Game Stats
  { type: 'score', label: 'Final Score', category: 'stat', description: 'Total points caught in the session', badge: 'PRIMARY' },
  { type: 'time', label: 'Time Elapsed', category: 'stat', description: 'Total game countdown time elapsed' },
  { type: 'accuracy', label: 'Catch Accuracy', category: 'stat', description: 'Percentage of good brand items caught' },
  { type: 'leaderboard', label: 'Leaderboard', category: 'stat', description: 'Event leaderboard and score submission widget' },
  // Interactive Controls
  { type: 'button', label: 'Action Button', category: 'control', description: 'Play again or exit button' },
];

/**
 * Result screen elements for Memory Match card games
 */
export const MEMORY_MATCH_RESULT_ELEMENTS: ResultElementDefinition[] = [
  // Containers
  { type: 'card', label: 'Card Container', category: 'container', description: 'Framed card container for grouping elements' },
  { type: 'group', label: 'Group Wrapper', category: 'container', description: 'Invisible group wrapper for layered positioning' },
  // Visual Elements
  { type: 'text', label: 'Text Block', category: 'visual', description: 'Headline, victory title, or custom message' },
  { type: 'image', label: 'Image / Icon', category: 'visual', description: 'Custom logo, trophy badge, or celebration artwork' },
  // Live Game Stats
  { type: 'score', label: 'Final Score', category: 'stat', description: 'Calculated memory score based on moves & time' },
  { type: 'moves', label: 'Total Moves', category: 'stat', description: 'Number of card flips taken' },
  { type: 'pairs', label: 'Matched Pairs', category: 'stat', description: 'Number of completed pairs matched' },
  { type: 'time', label: 'Time Elapsed', category: 'stat', description: 'Total time to complete the board' },
  { type: 'accuracy', label: 'Flip Accuracy', category: 'stat', description: 'Accuracy percentage of matched pairs' },
  { type: 'leaderboard', label: 'Leaderboard', category: 'stat', description: 'Event leaderboard and score submission widget' },
  // Interactive Controls
  { type: 'button', label: 'Action Button', category: 'control', description: 'Play again or exit button' },
];

/**
 * Result screen elements for Reaction Game reflex tests
 * STRICT SEPARATION: No Score, No Moves, No Pairs! Only reflex & reaction speed metrics.
 */
export const REACTION_GAME_RESULT_ELEMENTS: ResultElementDefinition[] = [
  // Containers
  { type: 'card', label: 'Card Container', category: 'container', description: 'Framed card container for grouping elements' },
  { type: 'group', label: 'Group Wrapper', category: 'container', description: 'Invisible group wrapper for layered positioning' },
  // Visual Elements
  { type: 'text', label: 'Text Block', category: 'visual', description: 'Headline, reflex rating title, or custom message' },
  { type: 'image', label: 'Image / Icon', category: 'visual', description: 'Custom logo, trophy badge, or reflex icon' },
  // Live Game Stats (Game-Specific Reflex Metrics)
  { type: 'average-reaction', label: 'Average Reaction', category: 'stat', description: 'Mean response time across all valid rounds (in ms)', badge: 'PRIMARY' },
  { type: 'best-reaction', label: 'Best Reaction', category: 'stat', description: 'Fastest single round reaction time (in ms)' },
  { type: 'worst-reaction', label: 'Worst Reaction', category: 'stat', description: 'Slowest round reaction time (in ms)' },
  { type: 'round-results', label: 'Round Reactions', category: 'stat', description: 'Breakdown of individual round times (R1, R2, etc.)' },
  { type: 'rating', label: 'Reaction Rating', category: 'stat', description: 'Reflex assessment tier (Superhuman, Pro Racer, etc.)' },
  { type: 'leaderboard', label: 'Reaction Leaderboard', category: 'stat', description: 'Top reflex speed rankings (lower ms = higher rank)' },
  // Interactive Controls
  { type: 'button', label: 'Action Button', category: 'control', description: 'Play again or exit button' },
];

/**
 * Returns the exact list of available result-screen elements for a given game type.
 */
export function getAvailableResultElements(gameType?: string): ResultElementDefinition[] {
  if (gameType === 'reaction-time' || gameType === 'reaction-tap') {
    return REACTION_GAME_RESULT_ELEMENTS;
  }
  if (gameType === 'memory-match') {
    return MEMORY_MATCH_RESULT_ELEMENTS;
  }
  return CATCH_BRAND_RESULT_ELEMENTS;
}

/**
 * Groups available result elements into categories (container, visual, stat, control)
 */
export function getResultElementsGroupedByCategory(gameType?: string): Record<ResultElementCategory, ResultElementDefinition[]> {
  const elements = getAvailableResultElements(gameType);
  return {
    container: elements.filter((e) => e.category === 'container'),
    visual: elements.filter((e) => e.category === 'visual'),
    stat: elements.filter((e) => e.category === 'stat'),
    control: elements.filter((e) => e.category === 'control'),
  };
}

/**
 * Returns human-readable default label for an element type in a given game
 */
export function getDefaultElementLabel(type: ResultScreenElementType, gameType?: string): string {
  const elements = getAvailableResultElements(gameType);
  const found = elements.find((e) => e.type === type);
  if (found) return found.label;

  switch (type) {
    case 'card': return 'Card Container';
    case 'group': return 'Group Wrapper';
    case 'text': return 'Text Block';
    case 'image': return 'Image / Icon';
    case 'score': return 'Final Score';
    case 'moves': return 'Total Moves';
    case 'pairs': return 'Matched Pairs';
    case 'time': return 'Time Elapsed';
    case 'accuracy': return 'Accuracy';
    case 'average-reaction': return 'Average Reaction';
    case 'best-reaction': return 'Best Reaction';
    case 'worst-reaction': return 'Worst Reaction';
    case 'round-results': return 'Round Reactions';
    case 'rating': return 'Reaction Rating';
    case 'leaderboard': return 'Leaderboard';
    case 'button': return 'Action Button';
    default: return type;
  }
}
