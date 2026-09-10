/**
 * Shared Visual Editor Engine - Generic Undo / Redo & Gesture History Management
 * Works identically for Start Screen and Result Screen editors.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { BaseVisualElement } from './types';

/**
 * Deep clones an element tree immutably.
 */
export function deepCloneElements<T extends BaseVisualElement = BaseVisualElement>(elements: T[]): T[] {
  return JSON.parse(JSON.stringify(elements));
}

/**
 * Checks if two element trees are structurally equal (for history deduplication).
 */
export function areElementsEqual<T extends BaseVisualElement = BaseVisualElement>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Filters a list of selected IDs to only those that exist in the given elements tree.
 */
export function filterValidSelectedIds<T extends BaseVisualElement = BaseVisualElement>(
  selectedIds: string[] | any,
  elements: T[]
): string[] {
  if (!selectedIds) return [];
  const rawList: string[] = Array.isArray(selectedIds)
    ? selectedIds
    : typeof selectedIds === 'string'
    ? [selectedIds]
    : selectedIds instanceof Set
    ? Array.from(selectedIds)
    : Array.isArray(selectedIds.validSelectedIds)
    ? selectedIds.validSelectedIds
    : [];
  if (rawList.length === 0) return [];
  const existingIds = new Set<string>();

  const collectIds = (items: T[]) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item && item.id) {
        existingIds.add(item.id);
        if (Array.isArray(item.children) && item.children.length > 0) {
          collectIds(item.children as T[]);
        }
      }
    }
  };

  collectIds(elements);
  return rawList.filter((id) => typeof id === 'string' && existingIds.has(id));
}

export const MAX_HISTORY_LENGTH = 60;

/**
 * Pure state reducer for visual editor history.
 */
export class VisualEditorHistoryManager<T extends BaseVisualElement = BaseVisualElement> {
  private past: T[][] = [];
  private present: T[];
  private future: T[][] = [];
  private maxHistory: number;
  private gestureStartSnapshot: T[] | null = null;

  constructor(initialElements: T[], maxHistory = MAX_HISTORY_LENGTH) {
    this.present = deepCloneElements(initialElements);
    this.maxHistory = maxHistory;
  }

  public getPresent(): T[] {
    return this.present;
  }

  public getPast(): T[][] {
    return this.past;
  }

  public getFuture(): T[][] {
    return this.future;
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public syncExternalPresent(externalElements: T[]): void {
    if (!areElementsEqual(this.present, externalElements)) {
      this.present = deepCloneElements(externalElements);
    }
  }

  public reset(newInitialElements: T[]): void {
    this.past = [];
    this.present = deepCloneElements(newInitialElements);
    this.future = [];
    this.gestureStartSnapshot = null;
  }

  public recordChange(newElements: T[]): boolean {
    if (areElementsEqual(this.present, newElements)) {
      return false;
    }

    this.past.push(deepCloneElements(this.present));
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }

    this.present = deepCloneElements(newElements);
    this.future = [];
    return true;
  }

  public pushSnapshot(newElements: T[]): boolean {
    return this.recordChange(newElements);
  }

  public push(newElements: T[]): boolean {
    return this.recordChange(newElements);
  }

  public beginGesture(currentElements: T[]): void {
    this.gestureStartSnapshot = deepCloneElements(currentElements);
  }

  public commitGesture(finalElements: T[]): boolean {
    if (!this.gestureStartSnapshot) {
      return this.recordChange(finalElements);
    }

    const start = this.gestureStartSnapshot;
    this.gestureStartSnapshot = null;

    if (areElementsEqual(start, finalElements)) {
      return false;
    }

    this.past.push(start);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }

    this.present = deepCloneElements(finalElements);
    this.future = [];
    return true;
  }

  public endGesture(finalElements: T[]): boolean {
    return this.commitGesture(finalElements);
  }

  public cancelGesture(): T[] | null {
    if (!this.gestureStartSnapshot) return null;
    const restored = deepCloneElements(this.gestureStartSnapshot);
    this.present = deepCloneElements(restored);
    this.gestureStartSnapshot = null;
    return restored;
  }

  public undo(): T[] | null {
    if (!this.canUndo()) return null;

    const previous = this.past.pop()!;
    this.future.unshift(deepCloneElements(this.present));
    this.present = previous;

    return deepCloneElements(this.present);
  }

  public redo(): T[] | null {
    if (!this.canRedo()) return null;

    const next = this.future.shift()!;
    this.past.push(deepCloneElements(this.present));
    this.present = next;

    return deepCloneElements(this.present);
  }
}

/**
 * React hook that manages undo/redo stack and gesture batching.
 */
export function useVisualEditorHistory<T extends BaseVisualElement = BaseVisualElement>(
  initialElements: T[],
  maxHistory = MAX_HISTORY_LENGTH
) {
  const [elements, setElements] = useState<T[]>(() => deepCloneElements(initialElements));
  const managerRef = useRef<VisualEditorHistoryManager<T> | null>(null);

  if (!managerRef.current) {
    managerRef.current = new VisualEditorHistoryManager<T>(initialElements, maxHistory);
  }

  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  const updateFlags = useCallback(() => {
    if (managerRef.current) {
      setCanUndo(managerRef.current.canUndo());
      setCanRedo(managerRef.current.canRedo());
    }
  }, []);

  const resetHistory = useCallback(
    (newInitial: T[]) => {
      if (managerRef.current) {
        managerRef.current.reset(newInitial);
        setElements(deepCloneElements(newInitial));
        updateFlags();
      }
    },
    [updateFlags]
  );

  const recordChange = useCallback(
    (newElements: T[]) => {
      if (managerRef.current) {
        const changed = managerRef.current.recordChange(newElements);
        if (changed) {
          setElements(deepCloneElements(newElements));
          updateFlags();
        }
      }
    },
    [updateFlags]
  );

  const pushSnapshot = recordChange;

  const beginGesture = useCallback((currentElements: T[]) => {
    if (managerRef.current) {
      managerRef.current.beginGesture(currentElements);
    }
  }, []);

  const commitGesture = useCallback(
    (finalElements: T[]) => {
      if (managerRef.current) {
        const changed = managerRef.current.commitGesture(finalElements);
        if (changed) {
          setElements(deepCloneElements(finalElements));
          updateFlags();
        }
      }
    },
    [updateFlags]
  );

  const endGesture = commitGesture;

  const cancelGesture = useCallback(() => {
    if (managerRef.current) {
      const restored = managerRef.current.cancelGesture();
      if (restored) {
        setElements(restored);
        updateFlags();
      }
    }
  }, [updateFlags]);

  const undo = useCallback((): T[] | null => {
    if (managerRef.current) {
      const restored = managerRef.current.undo();
      if (restored) {
        setElements(restored);
        updateFlags();
        return restored;
      }
    }
    return null;
  }, [updateFlags]);

  const redo = useCallback((): T[] | null => {
    if (managerRef.current) {
      const restored = managerRef.current.redo();
      if (restored) {
        setElements(restored);
        updateFlags();
        return restored;
      }
    }
    return null;
  }, [updateFlags]);

  // Keep manager present in sync if elements state is updated externally
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.syncExternalPresent(elements);
    }
  }, [elements]);

  return {
    elements,
    setElementsDirect: setElements,
    pushSnapshot,
    recordChange,
    beginGesture,
    commitGesture,
    endGesture,
    cancelGesture,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  };
}
