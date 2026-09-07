import { StartScreenElement } from '../../../../games/shared/startScreenTypes';

export interface CustomStartScreenTemplate {
  id: string;
  name: string;
  description: string;
  gameType: string;
  createdAt: string;
  updatedAt: string;
  elements: StartScreenElement[];
}

export type CustomStartTemplate = CustomStartScreenTemplate;

export const START_SCREEN_TEMPLATES_STORAGE_KEY = 'event_game_start_screen_custom_templates';

export function getCustomStartTemplates(gameType?: string): CustomStartScreenTemplate[] {
  try {
    const raw = localStorage.getItem(START_SCREEN_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const list: CustomStartScreenTemplate[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (gameType) {
      return list.filter((t) => t.gameType === gameType || t.gameType === 'all');
    }
    return list;
  } catch (err) {
    console.warn('Failed to load custom start screen templates from localStorage:', err);
    return [];
  }
}

export function saveCustomStartTemplate(
  nameOrOptions:
    | string
    | {
        name: string;
        description?: string;
        elements: StartScreenElement[];
        gameType?: string;
        category?: string;
      },
  description?: string,
  elements?: StartScreenElement[],
  gameType: string = 'all'
): CustomStartScreenTemplate {
  let name = '';
  let desc = '';
  let elems: StartScreenElement[] = [];
  let gType = 'all';

  if (typeof nameOrOptions === 'object') {
    name = nameOrOptions.name;
    desc = nameOrOptions.description || '';
    elems = nameOrOptions.elements || [];
    gType = nameOrOptions.gameType || 'all';
  } else {
    name = nameOrOptions;
    desc = description || '';
    elems = elements || [];
    gType = gameType;
  }

  const existing = getCustomStartTemplates();
  const newTemplate: CustomStartScreenTemplate = {
    id: `template_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Untitled Template',
    description: desc.trim() || '',
    gameType: gType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elements: JSON.parse(JSON.stringify(elems)),
  };

  const updated = [newTemplate, ...existing];
  try {
    localStorage.setItem(START_SCREEN_TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save custom start screen template to localStorage:', err);
  }
  return newTemplate;
}

export function deleteCustomStartTemplate(templateId: string): boolean {
  const existing = getCustomStartTemplates();
  const filtered = existing.filter((t) => t.id !== templateId);
  try {
    localStorage.setItem(START_SCREEN_TEMPLATES_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.warn('Failed to delete custom start screen template from localStorage:', err);
    return false;
  }
}

export function instantiateCustomStartTemplate(template: CustomStartScreenTemplate): StartScreenElement[] {
  return JSON.parse(JSON.stringify(template.elements));
}
