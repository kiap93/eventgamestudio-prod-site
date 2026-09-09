import { useState, useRef, useCallback, useEffect } from 'react';
import { StartScreenElement } from '../../../../games/shared/startScreenTypes';
import { findElementAndParent } from './types';

export interface StartScreenHistorySnapshot {
  elements: StartScreenElement[];
  selectedId: string | null;
  selectedIds: string[];
}

export function deepCloneElements(elements: StartScreenElement[]): StartScreenElement[] {
  return JSON.parse(JSON.stringify(elements));
}

export function areElementsEqual(a: StartScreenElement[], b: StartScreenElement[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function filterValidSelectedIds(
  ids: string[],
  elements: StartScreenElement[]
): { validSelectedId: string | null; validSelectedIds: string[] } {
  const validIds = ids.filter((id) => findElementAndParent(id, elements) !== null);
  return {
    validSelectedId: validIds.length > 0 ? validIds[0] : null,
    validSelectedIds: validIds,
  };
}

export const filterValidStartSelectedIds = filterValidSelectedIds;

export function deepCloneSnapshot(snapshot: StartScreenHistorySnapshot): StartScreenHistorySnapshot {
  return {
    elements: deepCloneElements(snapshot.elements),
    selectedId: snapshot.selectedId,
    selectedIds: [...snapshot.selectedIds],
  };
}

export class StartScreenHistoryManager {
  private past: StartScreenHistorySnapshot[] = [];
  private present: StartScreenHistorySnapshot;
  private future: StartScreenHistorySnapshot[] = [];
  private maxHistory: number;
  private gestureStartSnapshot: StartScreenHistorySnapshot | null = null;

  constructor(initialElements: StartScreenElement[], maxHistory = 40) {
    this.maxHistory = maxHistory;
    this.present = {
      elements: deepCloneElements(initialElements),
      selectedId: null,
      selectedIds: [],
    };
  }

  getPresent(): StartScreenHistorySnapshot {
    return this.present;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  push(elements: StartScreenElement[], selectedId: string | null = null, selectedIds: string[] = []): boolean {
    if (areElementsEqual(this.present.elements, elements)) {
      this.present.selectedId = selectedId;
      this.present.selectedIds = selectedIds;
      return false;
    }

    this.past.push(deepCloneSnapshot(this.present));
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }

    const { validSelectedId, validSelectedIds } = filterValidSelectedIds(
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [],
      elements
    );

    this.present = {
      elements: deepCloneElements(elements),
      selectedId: validSelectedId,
      selectedIds: validSelectedIds,
    };

    this.future = [];
    return true;
  }

  beginGesture(elements: StartScreenElement[], selectedId: string | null = null, selectedIds: string[] = []): void {
    const { validSelectedId, validSelectedIds } = filterValidSelectedIds(
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [],
      elements
    );
    this.gestureStartSnapshot = {
      elements: deepCloneElements(elements),
      selectedId: validSelectedId,
      selectedIds: validSelectedIds,
    };
  }

  updateLive(elements: StartScreenElement[]): void {
    this.present.elements = deepCloneElements(elements);
  }

  commitGesture(elements: StartScreenElement[], selectedId: string | null = null, selectedIds: string[] = []): boolean {
    if (!this.gestureStartSnapshot) {
      return this.push(elements, selectedId, selectedIds);
    }

    const startSnapshot = this.gestureStartSnapshot;
    this.gestureStartSnapshot = null;

    if (areElementsEqual(startSnapshot.elements, elements)) {
      return false;
    }

    this.past.push(startSnapshot);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }

    const { validSelectedId, validSelectedIds } = filterValidSelectedIds(
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [],
      elements
    );

    this.present = {
      elements: deepCloneElements(elements),
      selectedId: validSelectedId,
      selectedIds: validSelectedIds,
    };

    this.future = [];
    return true;
  }

  cancelGesture(): void {
    this.gestureStartSnapshot = null;
  }

  undo(): StartScreenHistorySnapshot | null {
    if (!this.canUndo()) return null;

    const previous = this.past.pop()!;
    this.future.unshift(deepCloneSnapshot(this.present));

    const { validSelectedId, validSelectedIds } = filterValidSelectedIds(
      previous.selectedIds.length > 0
        ? previous.selectedIds
        : previous.selectedId
        ? [previous.selectedId]
        : [],
      previous.elements
    );

    this.present = {
      elements: deepCloneElements(previous.elements),
      selectedId: validSelectedId,
      selectedIds: validSelectedIds,
    };

    return this.present;
  }

  redo(): StartScreenHistorySnapshot | null {
    if (!this.canRedo()) return null;

    const next = this.future.shift()!;
    this.past.push(deepCloneSnapshot(this.present));

    const { validSelectedId, validSelectedIds } = filterValidSelectedIds(
      next.selectedIds.length > 0 ? next.selectedIds : next.selectedId ? [next.selectedId] : [],
      next.elements
    );

    this.present = {
      elements: deepCloneElements(next.elements),
      selectedId: validSelectedId,
      selectedIds: validSelectedIds,
    };

    return this.present;
  }

  syncExternal(elements: StartScreenElement[]) {
    if (!areElementsEqual(this.present.elements, elements)) {
      this.present = {
        elements: deepCloneElements(elements),
        selectedId: this.present.selectedId,
        selectedIds: this.present.selectedIds,
      };
      this.future = [];
    }
  }

  reset(elements: StartScreenElement[]) {
    this.past = [];
    this.future = [];
    this.gestureStartSnapshot = null;
    this.present = {
      elements: deepCloneElements(elements),
      selectedId: null,
      selectedIds: [],
    };
  }
}

export interface StartScreenHistoryController {
  elements: StartScreenElement[];
  canUndo: boolean;
  canRedo: boolean;
  pushSnapshot: (elements: StartScreenElement[], selectedId?: string | null, selectedIds?: string[]) => void;
  updateLive: (elements: StartScreenElement[]) => void;
  undo: () => StartScreenHistorySnapshot | null;
  redo: () => StartScreenHistorySnapshot | null;
  beginGesture: (elements: StartScreenElement[], selectedId?: string | null, selectedIds?: string[]) => void;
  endGesture: (elements: StartScreenElement[], selectedId?: string | null, selectedIds?: string[]) => void;
  syncExternal: (elements: StartScreenElement[]) => void;
  reset: (elements: StartScreenElement[]) => void;
}

export function useStartScreenHistory(
  initialElements: StartScreenElement[],
  onElementsChange?: (elements: StartScreenElement[]) => void
): StartScreenHistoryController {
  const managerRef = useRef<StartScreenHistoryManager>(new StartScreenHistoryManager(initialElements));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentElements, setCurrentElements] = useState<StartScreenElement[]>(initialElements);
  const isGestureActiveRef = useRef(false);

  const updateState = useCallback(() => {
    setCanUndo(managerRef.current.canUndo());
    setCanRedo(managerRef.current.canRedo());
    setCurrentElements(managerRef.current.getPresent().elements);
  }, []);

  const pushSnapshot = useCallback(
    (elements: StartScreenElement[], selectedId: string | null = null, selectedIds: string[] = []) => {
      const changed = managerRef.current.push(elements, selectedId, selectedIds);
      if (changed) {
        updateState();
        if (onElementsChange) {
          onElementsChange(managerRef.current.getPresent().elements);
        }
      }
    },
    [updateState, onElementsChange]
  );

  const updateLive = useCallback(
    (elements: StartScreenElement[]) => {
      managerRef.current.updateLive(elements);
      setCurrentElements(elements);
      if (onElementsChange) {
        onElementsChange(elements);
      }
    },
    [onElementsChange]
  );

  const beginGesture = useCallback(
    (elements: StartScreenElement[], selectedId: string | null = null, selectedIds: string[] = []) => {
      isGestureActiveRef.current = true;
      managerRef.current.beginGesture(elements, selectedId, selectedIds);
    },
    []
  );

  const endGesture = useCallback(
    (elements: StartScreenElement[], selectedId: string | null = null, selectedIds: string[] = []) => {
      if (!isGestureActiveRef.current) return;
      isGestureActiveRef.current = false;

      const changed = managerRef.current.commitGesture(elements, selectedId, selectedIds);
      if (changed) {
        updateState();
        if (onElementsChange) {
          onElementsChange(managerRef.current.getPresent().elements);
        }
      }
    },
    [updateState, onElementsChange]
  );

  const undo = useCallback((): StartScreenHistorySnapshot | null => {
    const res = managerRef.current.undo();
    if (res) {
      updateState();
      if (onElementsChange) {
        onElementsChange(res.elements);
      }
    }
    return res;
  }, [updateState, onElementsChange]);

  const redo = useCallback((): StartScreenHistorySnapshot | null => {
    const res = managerRef.current.redo();
    if (res) {
      updateState();
      if (onElementsChange) {
        onElementsChange(res.elements);
      }
    }
    return res;
  }, [updateState, onElementsChange]);

  const syncExternal = useCallback(
    (elements: StartScreenElement[]) => {
      managerRef.current.syncExternal(elements);
      updateState();
    },
    [updateState]
  );

  const reset = useCallback(
    (elements: StartScreenElement[]) => {
      managerRef.current.reset(elements);
      updateState();
    },
    [updateState]
  );

  return {
    elements: currentElements,
    canUndo,
    canRedo,
    pushSnapshot,
    updateLive,
    undo,
    redo,
    beginGesture,
    endGesture,
    syncExternal,
    reset,
  };
}
