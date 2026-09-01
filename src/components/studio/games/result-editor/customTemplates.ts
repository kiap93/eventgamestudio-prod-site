import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
} from '../../../../games/memory-match/types';
import { cloneElementsWithFreshIds } from './presets';

export const CUSTOM_TEMPLATES_STORAGE_KEY = 'memory_match_custom_result_templates';

export interface CustomResultScreenTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  elements: ResultScreenElement[];
  background?: {
    type?: 'color' | 'theme' | 'image';
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundOverlayOpacity?: number;
  };
}

/**
 * Sanitize an element tree to ensure only static layout configurations are preserved.
 * Explicitly excludes any transient runtime metadata, guides, or selection references.
 */
export function sanitizeElementsForTemplate(elements: ResultScreenElement[]): ResultScreenElement[] {
  return elements.map((item) => {
    // Deep clone base properties
    const base = {
      id: item.id,
      type: item.type,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: Number(item.width) || 100,
      height: Number(item.height) || 100,
      rotation: Number(item.rotation) || 0,
      visible: item.visible !== false,
      opacity: typeof item.opacity === 'number' ? item.opacity : 1,
      zIndex: typeof item.zIndex === 'number' ? item.zIndex : 1,
      locked: Boolean(item.locked),
    };

    if (item.type === 'card') {
      const card = item as ResultCardElement;
      return {
        ...base,
        type: 'card',
        style: card.style ? JSON.parse(JSON.stringify(card.style)) : undefined,
        children: card.children ? sanitizeElementsForTemplate(card.children) : [],
      } as ResultCardElement;
    }

    if (item.type === 'group') {
      const group = item as ResultGroupElement;
      return {
        ...base,
        type: 'group',
        children: group.children ? sanitizeElementsForTemplate(group.children) : [],
      } as ResultGroupElement;
    }

    // Leaf elements: text, score, moves, pairs, time, accuracy, button, image
    const leafClone = JSON.parse(JSON.stringify(item));
    return {
      ...leafClone,
      ...base,
    } as ResultScreenElement;
  });
}

/**
 * Retrieve all saved custom templates from persistent storage
 */
export function getCustomTemplates(): CustomResultScreenTemplate[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    const raw = window.localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error('Failed to load custom result screen templates from localStorage:', err);
    return [];
  }
}

/**
 * Save a custom template to persistent storage
 */
export function saveCustomTemplate(
  name: string,
  description: string,
  elements: ResultScreenElement[],
  category = 'Custom',
  background?: CustomResultScreenTemplate['background']
): CustomResultScreenTemplate {
  const sanitized = sanitizeElementsForTemplate(elements);
  // Ensure template holds its own isolated copy
  const clonedElements = cloneElementsWithFreshIds(sanitized);

  const now = new Date().toISOString();
  const templateId = `tmpl-${Math.random().toString(36).substring(2, 9)}-${Date.now().toString(36)}`;

  const newTemplate: CustomResultScreenTemplate = {
    id: templateId,
    name: name.trim() || 'Untitled Template',
    description: description.trim() || 'Custom Result Screen layout template',
    category: category.trim() || 'Custom',
    createdAt: now,
    updatedAt: now,
    elements: clonedElements,
    background: background ? JSON.parse(JSON.stringify(background)) : undefined,
  };

  const currentTemplates = getCustomTemplates();
  const updatedList = [newTemplate, ...currentTemplates];

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(updatedList));
    }
  } catch (err) {
    console.error('Failed to save custom template to localStorage:', err);
  }

  return newTemplate;
}

/**
 * Update an existing custom template
 */
export function updateCustomTemplate(
  id: string,
  updates: Partial<Omit<CustomResultScreenTemplate, 'id' | 'createdAt'>>
): CustomResultScreenTemplate | null {
  const currentTemplates = getCustomTemplates();
  const index = currentTemplates.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const existing = currentTemplates[index];
  const updated: CustomResultScreenTemplate = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.elements) {
    const sanitized = sanitizeElementsForTemplate(updates.elements);
    updated.elements = cloneElementsWithFreshIds(sanitized);
  }

  currentTemplates[index] = updated;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(currentTemplates));
    }
  } catch (err) {
    console.error('Failed to update custom template in localStorage:', err);
  }

  return updated;
}

/**
 * Delete a custom template by ID
 */
export function deleteCustomTemplate(id: string): boolean {
  const currentTemplates = getCustomTemplates();
  const filtered = currentTemplates.filter((t) => t.id !== id);
  if (filtered.length === currentTemplates.length) return false;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(filtered));
    }
    return true;
  } catch (err) {
    console.error('Failed to delete custom template from localStorage:', err);
    return false;
  }
}

/**
 * Instantiate elements from a custom template with completely new unique IDs
 * and deep-cloned properties to guarantee total reference isolation.
 */
export function instantiateCustomTemplate(template: CustomResultScreenTemplate): ResultScreenElement[] {
  // 1. Deep clone template elements
  const isolatedCopy = JSON.parse(JSON.stringify(template.elements)) as ResultScreenElement[];
  // 2. Generate completely fresh unique IDs for all elements in tree
  return cloneElementsWithFreshIds(isolatedCopy);
}
