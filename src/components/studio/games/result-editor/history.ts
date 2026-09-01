import { useState, useCallback, useRef } from 'react';
import { ResultScreenElement, ResultCardElement, ResultGroupElement } from '../../../../games/memory-match/types';

/**
 * Deep clones a ResultScreenElement tree immutably.
 */
export function deepCloneElements(elements: ResultScreenElement[]): ResultScreenElement[] {
  return JSON.parse(JSON.stringify(elements));
}

/**
 * Checks if two element trees are structurally equal (for history deduplication).
 */
export function areElementsEqual(a: ResultScreenElement[], b: ResultScreenElement[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Filters a list of selected IDs to only those that exist in the given elements tree.
 */
export function filterValidSelectedIds(
  selectedIds: string[],
  elements: ResultScreenElement[]
): string[] {
  if (!selectedIds || selectedIds.length === 0) return [];
  const existingIds = new Set<string>();

  const collectIds = (items: ResultScreenElement[]) => {
    for (const item of items) {
      existingIds.add(item.id);
      if (item.type === 'card' && (item as ResultCardElement).children) {
        collectIds((item as ResultCardElement).children || []);
      }
      if (item.type === 'group' && (item as ResultGroupElement).children) {
        collectIds((item as ResultGroupElement).children || []);
      }
    }
  };

  collectIds(elements);
  return selectedIds.filter((id) => existingIds.has(id));
}

export interface HistoryState {
  past: ResultScreenElement[][];
  present: ResultScreenElement[];
  future: ResultScreenElement[][];
}

export const MAX_HISTORY_LENGTH = 60;

/**
 * Pure state reducer for Result Screen history.
 */
export class ResultScreenHistoryManager {
  private past: ResultScreenElement[][] = [];
  private present: ResultScreenElement[];
  private future: ResultScreenElement[][] = [];
  private maxHistory: number;
  private gestureStartSnapshot: ResultScreenElement[] | null = null;

  constructor(initialElements: ResultScreenElement[], maxHistory = MAX_HISTORY_LENGTH) {
    this.present = deepCloneElements(initialElements);
    this.maxHistory = maxHistory;
  }

  public getPresent(): ResultScreenElement[] {
    return this.present;
  }

  public getPast(): ResultScreenElement[][] {
    return this.past;
  }

  public getFuture(): ResultScreenElement[][] {
    return this.future;
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Resets history with a new initial baseline (e.g., when opening editor).
   */
  public reset(newInitialElements: ResultScreenElement[]): void {
    this.past = [];
    this.present = deepCloneElements(newInitialElements);
    this.future = [];
    this.gestureStartSnapshot = null;
  }

  /**
   * Push a discrete change to history.
   * If identical to present, no-ops.
   * Discards future redo branch.
   */
  public push(newElements: ResultScreenElement[]): boolean {
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

  /**
   * Begins a continuous gesture session (drag / resize / rotate).
   * Caches the starting snapshot.
   */
  public beginGesture(currentElements: ResultScreenElement[]): void {
    this.gestureStartSnapshot = deepCloneElements(currentElements);
  }

  /**
   * Completes a continuous gesture session.
   * If elements changed compared to gestureStartSnapshot, pushes gestureStartSnapshot to past,
   * updates present to finalElements, and clears future.
   */
  public commitGesture(finalElements: ResultScreenElement[]): boolean {
    if (!this.gestureStartSnapshot) {
      return false;
    }

    const startSnapshot = this.gestureStartSnapshot;
    this.gestureStartSnapshot = null;

    if (areElementsEqual(startSnapshot, finalElements)) {
      return false;
    }

    this.past.push(startSnapshot);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }

    this.present = deepCloneElements(finalElements);
    this.future = [];
    return true;
  }

  /**
   * Cancels an in-progress gesture without pushing history.
   */
  public cancelGesture(): void {
    this.gestureStartSnapshot = null;
  }

  /**
   * Restores the previous layout snapshot.
   * Returns the restored snapshot or null if undo is impossible.
   */
  public undo(): ResultScreenElement[] | null {
    if (!this.canUndo()) return null;

    const previous = this.past.pop()!;
    this.future.unshift(deepCloneElements(this.present));
    this.present = deepCloneElements(previous);
    return deepCloneElements(this.present);
  }

  /**
   * Restores the next available future layout snapshot.
   * Returns the restored snapshot or null if redo is impossible.
   */
  public redo(): ResultScreenElement[] | null {
    if (!this.canRedo()) return null;

    const next = this.future.shift()!;
    this.past.push(deepCloneElements(this.present));
    this.present = deepCloneElements(next);
    return deepCloneElements(this.present);
  }
}

/**
 * React hook to manage Result Screen undo/redo history.
 */
export function useResultScreenHistory(
  initialElements: ResultScreenElement[],
  onSyncExternal: (elements: ResultScreenElement[]) => void,
  maxHistory = MAX_HISTORY_LENGTH
) {
  const managerRef = useRef<ResultScreenHistoryManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new ResultScreenHistoryManager(initialElements, maxHistory);
  }

  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  const updateFlags = useCallback(() => {
    if (managerRef.current) {
      setCanUndo(managerRef.current.canUndo());
      setCanRedo(managerRef.current.canRedo());
    }
  }, []);

  // Discrete change (Add, Delete, Duplicate, Style change, Preset, Template, etc.)
  const recordChange = useCallback(
    (newElements: ResultScreenElement[]) => {
      if (!managerRef.current) return;
      const pushed = managerRef.current.push(newElements);
      if (pushed) {
        updateFlags();
        onSyncExternal(managerRef.current.getPresent());
      }
    },
    [onSyncExternal, updateFlags]
  );

  // Gesture Start (Drag / Resize / Rotate)
  const beginGesture = useCallback((currentElements: ResultScreenElement[]) => {
    if (managerRef.current) {
      managerRef.current.beginGesture(currentElements);
    }
  }, []);

  // Gesture Commit (Drag / Resize / Rotate)
  const commitGesture = useCallback(
    (finalElements: ResultScreenElement[]) => {
      if (!managerRef.current) return;
      const committed = managerRef.current.commitGesture(finalElements);
      if (committed) {
        updateFlags();
        onSyncExternal(managerRef.current.getPresent());
      }
    },
    [onSyncExternal, updateFlags]
  );

  // Gesture Cancel
  const cancelGesture = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.cancelGesture();
    }
  }, []);

  // Undo action
  const undo = useCallback((): ResultScreenElement[] | null => {
    if (!managerRef.current) return null;
    const restored = managerRef.current.undo();
    if (restored) {
      updateFlags();
      onSyncExternal(restored);
      return restored;
    }
    return null;
  }, [onSyncExternal, updateFlags]);

  // Redo action
  const redo = useCallback((): ResultScreenElement[] | null => {
    if (!managerRef.current) return null;
    const restored = managerRef.current.redo();
    if (restored) {
      updateFlags();
      onSyncExternal(restored);
      return restored;
    }
    return null;
  }, [onSyncExternal, updateFlags]);

  // Reset baseline
  const resetHistory = useCallback(
    (newElements: ResultScreenElement[]) => {
      if (managerRef.current) {
        managerRef.current.reset(newElements);
        updateFlags();
      }
    },
    [updateFlags]
  );

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    recordChange,
    beginGesture,
    commitGesture,
    cancelGesture,
    resetHistory,
  };
}

