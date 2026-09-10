/**
 * Result Screen Editor - Undo / Redo & Gesture History Management
 * Backed by the unified Shared Visual Editor history engine.
 */
import { useState, useCallback, useRef } from 'react';
import { ResultScreenElement } from '../../../../games/memory-match/types';
import {
  deepCloneElements,
  areElementsEqual,
  filterValidSelectedIds,
  MAX_HISTORY_LENGTH,
  VisualEditorHistoryManager,
} from '../shared-editor/history';

export {
  deepCloneElements,
  areElementsEqual,
  filterValidSelectedIds,
  MAX_HISTORY_LENGTH,
};

export class ResultScreenHistoryManager extends VisualEditorHistoryManager<ResultScreenElement> {}

export interface ResultScreenHistoryController {
  canUndo: boolean | (() => boolean);
  canRedo: boolean | (() => boolean);
  undo: () => ResultScreenElement[] | null;
  redo: () => ResultScreenElement[] | null;
  recordChange: (newElements: ResultScreenElement[]) => boolean | void;
  beginGesture: (current: ResultScreenElement[]) => void;
  commitGesture: (final: ResultScreenElement[]) => boolean | void;
  cancelGesture: () => void;
  resetHistory: (elements: ResultScreenElement[]) => void;
  syncExternal: (elements: ResultScreenElement[]) => void;
  push?: (elements: ResultScreenElement[]) => boolean | void;
}

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

  const recordChange = useCallback(
    (newElements: ResultScreenElement[]) => {
      if (!managerRef.current) return false;
      const changed = managerRef.current.recordChange(newElements);
      if (changed) {
        updateFlags();
      }
      return changed;
    },
    [updateFlags]
  );

  const beginGesture = useCallback((currentElements: ResultScreenElement[]) => {
    if (managerRef.current) {
      managerRef.current.beginGesture(currentElements);
    }
  }, []);

  const commitGesture = useCallback(
    (finalElements: ResultScreenElement[]) => {
      if (!managerRef.current) return false;
      const changed = managerRef.current.commitGesture(finalElements);
      if (changed) {
        updateFlags();
      }
      return changed;
    },
    [updateFlags]
  );

  const cancelGesture = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.cancelGesture();
    }
  }, []);

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

  const resetHistory = useCallback(
    (newElements: ResultScreenElement[]) => {
      if (managerRef.current) {
        managerRef.current.reset(newElements);
        updateFlags();
      }
    },
    [updateFlags]
  );

  const syncExternal = useCallback(
    (elements: ResultScreenElement[]) => {
      if (managerRef.current) {
        managerRef.current.syncExternalPresent(elements);
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
    syncExternal,
  };
}
