/**
 * Shared Visual Editor Engine - Custom Saved Templates
 * Supports local persistence and instantiation of custom screen templates.
 */
import { BaseVisualElement } from './types';

export interface CustomScreenTemplate<T extends BaseVisualElement = BaseVisualElement> {
  id: string;
  name: string;
  description: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  gameType?: string;
  elements: T[];
  background?: {
    type?: string;
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundOverlayOpacity?: number;
    backgroundGradient?: { from: string; to: string; direction?: string };
  };
}

/**
 * Clones element tree and generates fresh IDs.
 */
export function cloneElementsWithFreshIds<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  idPrefix = 'tpl'
): T[] {
  return elements.map((item) => {
    const freshId = `${item.type || idPrefix}_${Math.random().toString(36).substring(2, 9)}`;
    const cloned: any = {
      ...item,
      id: freshId,
    };

    if (Array.isArray(item.children)) {
      cloned.children = cloneElementsWithFreshIds(item.children as T[], idPrefix);
    }

    return cloned as T;
  });
}

/**
 * Sanitizes element tree for template export.
 */
export function sanitizeElementsForTemplate<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[]
): T[] {
  return elements.map((item) => {
    const base: any = {
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

    // Copy element-specific properties safely
    for (const key of Object.keys(item)) {
      if (!['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'visible', 'opacity', 'zIndex', 'locked', 'children'].includes(key)) {
        base[key] = JSON.parse(JSON.stringify((item as any)[key]));
      }
    }

    if (Array.isArray(item.children)) {
      base.children = sanitizeElementsForTemplate(item.children as T[]);
    }

    return base as T;
  });
}

/**
 * Loads custom templates from local storage.
 */
export function loadCustomTemplates<T extends BaseVisualElement = BaseVisualElement>(
  storageKey: string
): CustomScreenTemplate<T>[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`[VisualEditor] Failed to load templates for key: ${storageKey}`, err);
    return [];
  }
}

/**
 * Saves a new custom template into storage.
 */
export function saveCustomTemplate<T extends BaseVisualElement = BaseVisualElement>(
  storageKey: string,
  data: {
    name: string;
    description: string;
    category?: string;
    gameType?: string;
    elements: T[];
    background?: CustomScreenTemplate<T>['background'];
  }
): CustomScreenTemplate<T> {
  const existing = loadCustomTemplates<T>(storageKey);
  const now = new Date().toISOString();

  const newTemplate: CustomScreenTemplate<T> = {
    id: `template_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: data.name.trim(),
    description: data.description.trim(),
    category: data.category || 'Custom',
    createdAt: now,
    updatedAt: now,
    gameType: data.gameType,
    elements: sanitizeElementsForTemplate(data.elements),
    background: data.background ? JSON.parse(JSON.stringify(data.background)) : undefined,
  };

  const updated = [newTemplate, ...existing];
  try {
    localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch (err) {
    console.warn(`[VisualEditor] Failed to save template to localStorage`, err);
  }

  return newTemplate;
}

/**
 * Deletes a custom template by ID.
 */
export function deleteCustomTemplate<T extends BaseVisualElement = BaseVisualElement>(
  storageKey: string,
  templateId: string
): boolean {
  try {
    const existing = loadCustomTemplates<T>(storageKey);
    const filtered = existing.filter((t) => t.id !== templateId);
    localStorage.setItem(storageKey, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.warn(`[VisualEditor] Failed to delete template ${templateId}`, err);
    return false;
  }
}
