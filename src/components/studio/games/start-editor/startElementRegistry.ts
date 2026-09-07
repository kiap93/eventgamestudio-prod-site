import React from 'react';
import {
  Square,
  Type,
  Heading,
  AlignLeft,
  Image as ImageIcon,
  Play,
  Trophy,
  HelpCircle,
  Sparkles,
  Grid3X3,
  Layers,
  Clock,
  Zap,
  ShieldAlert,
  Award,
} from 'lucide-react';
import { StartScreenElementType } from '../../../../games/shared/startScreenTypes';

export interface StartElementRegistryItem {
  type: StartScreenElementType;
  label: string;
  category: 'container' | 'visual' | 'info' | 'control';
  description: string;
  icon: React.ElementType;
}

export const MEMORY_MATCH_START_ELEMENTS: StartElementRegistryItem[] = [
  // Containers
  {
    type: 'card',
    label: 'Card Container',
    category: 'container',
    description: 'Background container with border, blur, shadow, and nested child elements',
    icon: Square,
  },
  {
    type: 'group',
    label: 'Group',
    category: 'container',
    description: 'Logical grouping of elements for synchronized movement and scaling',
    icon: Layers,
  },

  // Visuals
  {
    type: 'icon',
    label: 'Game Emblem',
    category: 'visual',
    description: 'Stylized glowing icon or theme badge',
    icon: Sparkles,
  },
  {
    type: 'image',
    label: 'Logo / Image',
    category: 'visual',
    description: 'Brand sponsor logo, mascot avatar, or custom header image',
    icon: ImageIcon,
  },

  // Info & Typography
  {
    type: 'title',
    label: 'Game Title',
    category: 'info',
    description: 'Primary game title heading (defaults to theme name)',
    icon: Heading,
  },
  {
    type: 'description',
    label: 'Subtitle / Description',
    category: 'info',
    description: 'Brief instructions or theme narrative',
    icon: AlignLeft,
  },
  {
    type: 'badge',
    label: 'Info Badge',
    category: 'info',
    description: 'Pill showing grid size, pairs count, or timer duration',
    icon: Grid3X3,
  },
  {
    type: 'rules',
    label: 'Rules Card',
    category: 'info',
    description: 'Quick how-to-play instruction card',
    icon: HelpCircle,
  },
  {
    type: 'leaderboard',
    label: 'Leaderboard Preview',
    category: 'info',
    description: 'Live widget showing top 3 high scores',
    icon: Trophy,
  },
  {
    type: 'text',
    label: 'Custom Text',
    category: 'info',
    description: 'Flexible typography block for notes or sponsors',
    icon: Type,
  },

  // Controls
  {
    type: 'button',
    label: 'Action Button',
    category: 'control',
    description: 'Interactive button (Start Game, View Leaderboard, How To Play)',
    icon: Play,
  },
];

export const CATCH_BRAND_START_ELEMENTS: StartElementRegistryItem[] = [
  {
    type: 'card',
    label: 'Card Container',
    category: 'container',
    description: 'Arcade dialogue container with glow & border',
    icon: Square,
  },
  {
    type: 'group',
    label: 'Group',
    category: 'container',
    description: 'Logical group of elements',
    icon: Layers,
  },
  {
    type: 'icon',
    label: 'Arcade Emblem',
    category: 'visual',
    description: 'Retro arcade engine badge',
    icon: Sparkles,
  },
  {
    type: 'image',
    label: 'Brand Logo',
    category: 'visual',
    description: 'Client logo or theme hero graphic',
    icon: ImageIcon,
  },
  {
    type: 'title',
    label: 'Game Title',
    category: 'info',
    description: 'Arcade title heading',
    icon: Heading,
  },
  {
    type: 'description',
    label: 'Subtitle',
    category: 'info',
    description: 'Game instructions and tagline',
    icon: AlignLeft,
  },
  {
    type: 'rules',
    label: 'Target & Hazard Rules',
    category: 'info',
    description: 'Interactive cards displaying +10 target and -10 hazard items',
    icon: ShieldAlert,
  },
  {
    type: 'leaderboard',
    label: 'Leaderboard Preview',
    category: 'info',
    description: 'High scores widget',
    icon: Trophy,
  },
  {
    type: 'text',
    label: 'Controls Guide Text',
    category: 'info',
    description: 'Keyboard & touch controls description',
    icon: Type,
  },
  {
    type: 'button',
    label: 'Action Button',
    category: 'control',
    description: 'Pulsing Start Game or Leaderboard button',
    icon: Play,
  },
];

export const REACTION_GAME_START_ELEMENTS: StartElementRegistryItem[] = [
  {
    type: 'card',
    label: 'Card Container',
    category: 'container',
    description: 'High-contrast reflex challenge panel',
    icon: Square,
  },
  {
    type: 'group',
    label: 'Group',
    category: 'container',
    description: 'Group container',
    icon: Layers,
  },
  {
    type: 'icon',
    label: 'Lightning Emblem',
    category: 'visual',
    description: 'Glowing reflex challenge icon',
    icon: Zap,
  },
  {
    type: 'image',
    label: 'Brand Logo',
    category: 'visual',
    description: 'Event or sponsor brand graphic',
    icon: ImageIcon,
  },
  {
    type: 'title',
    label: 'Game Title',
    category: 'info',
    description: 'Reflex title heading',
    icon: Heading,
  },
  {
    type: 'description',
    label: 'Instructions',
    category: 'info',
    description: 'Lights sequence reaction instructions',
    icon: AlignLeft,
  },
  {
    type: 'badge',
    label: 'Round & Lights Badge',
    category: 'info',
    description: 'Pill showing rounds or light sequence count',
    icon: Zap,
  },
  {
    type: 'rules',
    label: 'Reflex Rules Card',
    category: 'info',
    description: 'Reaction timing rules and false start penalties',
    icon: HelpCircle,
  },
  {
    type: 'leaderboard',
    label: 'Leaderboard Preview',
    category: 'info',
    description: 'Fastest reaction times leaderboard',
    icon: Trophy,
  },
  {
    type: 'text',
    label: 'Custom Text',
    category: 'info',
    description: 'Custom notes or instructions',
    icon: Type,
  },
  {
    type: 'button',
    label: 'Action Button',
    category: 'control',
    description: 'Start Reflex Challenge button',
    icon: Play,
  },
];

export const getAvailableStartElements = (gameType: string): StartElementRegistryItem[] => {
  if (gameType === 'reaction-tap' || gameType === 'reaction-time') {
    return REACTION_GAME_START_ELEMENTS;
  }
  if (gameType === 'catch-brand') {
    return CATCH_BRAND_START_ELEMENTS;
  }
  return MEMORY_MATCH_START_ELEMENTS;
};

export const getStartElementsGroupedByCategory = (gameType: string) => {
  const elements = getAvailableStartElements(gameType);
  return {
    containers: elements.filter((e) => e.category === 'container'),
    visuals: elements.filter((e) => e.category === 'visual'),
    info: elements.filter((e) => e.category === 'info'),
    controls: elements.filter((e) => e.category === 'control'),
  };
};

export const getDefaultStartElementLabel = (
  type: StartScreenElementType,
  gameType: string
): string => {
  const elements = getAvailableStartElements(gameType);
  const found = elements.find((e) => e.type === type);
  return found ? found.label : type.toUpperCase();
};
