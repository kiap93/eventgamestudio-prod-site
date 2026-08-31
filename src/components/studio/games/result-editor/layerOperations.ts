import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultScreenElementType,
} from '../../../../games/memory-match/types';
import { findElementAndParent } from './types';

/**
 * Checks if the given selection of elements can be grouped.
 * Elements must:
 * 1. Have at least 2 items selected.
 * 2. All share the exact same immediate parent (root or same container).
 */
export function canGroupElements(
  elements: ResultScreenElement[],
  selectedIds: string[]
): boolean {
  if (!selectedIds || selectedIds.length < 2) return false;

  const firstInfo = findElementAndParent(selectedIds[0], elements);
  if (!firstInfo) return false;

  const firstParentId = firstInfo.parent ? firstInfo.parent.id : 'root';

  for (let i = 1; i < selectedIds.length; i++) {
    const info = findElementAndParent(selectedIds[i], elements);
    if (!info) return false;
    const parentId = info.parent ? info.parent.id : 'root';
    if (parentId !== firstParentId) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if any selected element is a Group and can be ungrouped.
 */
export function canUngroupElements(
  elements: ResultScreenElement[],
  selectedIds: string[]
): boolean {
  if (!selectedIds || selectedIds.length === 0) return false;

  for (const id of selectedIds) {
    const info = findElementAndParent(id, elements);
    if (info && info.element.type === 'group') {
      return true;
    }
  }
  return false;
}

/**
 * Groups multiple sibling elements into a new ResultGroupElement.
 * Calculates the bounding box, converts local coordinates of children to group-relative,
 * replaces original siblings with the new group in-place, and preserves exact visual rendering.
 */
export function groupElements(
  elements: ResultScreenElement[],
  targetIds: string[]
): { updatedElements: ResultScreenElement[]; newGroupId: string | null } {
  if (!canGroupElements(elements, targetIds)) {
    return { updatedElements: elements, newGroupId: null };
  }

  const firstInfo = findElementAndParent(targetIds[0], elements);
  if (!firstInfo) return { updatedElements: elements, newGroupId: null };

  const parent = firstInfo.parent;
  const targetIdSet = new Set(targetIds);

  // Retrieve the target elements in their current sibling order
  const siblingList = parent ? parent.children || [] : elements;
  const targetElements = siblingList.filter((el) => targetIdSet.has(el.id));

  if (targetElements.length < 2) {
    return { updatedElements: elements, newGroupId: null };
  }

  // Calculate tight bounding box
  const minX = Math.min(...targetElements.map((e) => e.x));
  const minY = Math.min(...targetElements.map((e) => e.y));
  const maxX = Math.max(...targetElements.map((e) => e.x + e.width));
  const maxY = Math.max(...targetElements.map((e) => e.y + e.height));

  const groupWidth = Math.max(20, Math.round(maxX - minX));
  const groupHeight = Math.max(20, Math.round(maxY - minY));

  // Convert children to be relative to the new group origin (minX, minY)
  const convertedChildren: ResultScreenElement[] = targetElements.map((child, idx) => ({
    ...child,
    x: Math.round(child.x - minX),
    y: Math.round(child.y - minY),
    zIndex: idx + 1,
  }));

  const newGroupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Find the index of the first target element in the sibling list to place the group there
  const insertIndex = siblingList.findIndex((el) => targetIdSet.has(el.id));

  const newGroup: ResultGroupElement = {
    id: newGroupId,
    type: 'group',
    x: Math.round(minX),
    y: Math.round(minY),
    width: groupWidth,
    height: groupHeight,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: insertIndex >= 0 ? insertIndex + 1 : 1,
    children: convertedChildren,
  };

  // Construct new sibling list: filter out grouped items and insert newGroup at insertIndex
  const newSiblings: ResultScreenElement[] = [];
  let inserted = false;

  for (let i = 0; i < siblingList.length; i++) {
    const item = siblingList[i];
    if (targetIdSet.has(item.id)) {
      if (!inserted) {
        newSiblings.push(newGroup);
        inserted = true;
      }
    } else {
      newSiblings.push(item);
    }
  }

  if (!inserted) {
    newSiblings.push(newGroup);
  }

  // Normalize zIndex across siblings
  const normalizedSiblings = newSiblings.map((item, idx) => ({
    ...item,
    zIndex: idx + 1,
  }));

  // Update tree
  const updateTree = (list: ResultScreenElement[]): ResultScreenElement[] => {
    if (!parent) {
      return normalizedSiblings;
    }
    return list.map((item) => {
      if (item.id === parent.id) {
        return {
          ...item,
          children: normalizedSiblings,
        } as ResultCardElement | ResultGroupElement;
      }
      if (item.type === 'card' && (item as ResultCardElement).children) {
        return {
          ...item,
          children: updateTree((item as ResultCardElement).children || []),
        } as ResultCardElement;
      }
      if (item.type === 'group' && (item as ResultGroupElement).children) {
        return {
          ...item,
          children: updateTree((item as ResultGroupElement).children || []),
        } as ResultGroupElement;
      }
      return item;
    });
  };

  return {
    updatedElements: updateTree(elements),
    newGroupId,
  };
}

/**
 * Ungroups one or more ResultGroupElement instances.
 * Converts child coordinates back to the group's parent coordinate space,
 * replaces the group with its unpacked children in-place, and preserves exact visual rendering.
 */
export function ungroupElements(
  elements: ResultScreenElement[],
  targetIds: string[]
): { updatedElements: ResultScreenElement[]; unpackedIds: string[] } {
  const targetIdSet = new Set(targetIds);
  const unpackedIds: string[] = [];

  const processList = (list: ResultScreenElement[]): ResultScreenElement[] => {
    const result: ResultScreenElement[] = [];

    for (const item of list) {
      if (item.type === 'group' && targetIdSet.has(item.id)) {
        const group = item as ResultGroupElement;
        const groupChildren = group.children || [];

        // Convert each child's coordinates to the group parent's coordinate space
        for (const child of groupChildren) {
          const convertedChild: ResultScreenElement = {
            ...child,
            x: Math.round(group.x + child.x),
            y: Math.round(group.y + child.y),
          };
          result.push(convertedChild);
          unpackedIds.push(convertedChild.id);
        }
      } else {
        let processedItem = item;
        if (item.type === 'card' && (item as ResultCardElement).children) {
          processedItem = {
            ...item,
            children: processList((item as ResultCardElement).children || []),
          } as ResultCardElement;
        } else if (item.type === 'group' && (item as ResultGroupElement).children) {
          processedItem = {
            ...item,
            children: processList((item as ResultGroupElement).children || []),
          } as ResultGroupElement;
        }
        result.push(processedItem);
      }
    }

    // Normalize zIndex
    return result.map((el, idx) => ({ ...el, zIndex: idx + 1 }));
  };

  const updatedElements = processList(elements);

  return {
    updatedElements,
    unpackedIds,
  };
}

/**
 * Reorders layers strictly within the same sibling list under the same immediate parent.
 * Reorder operations:
 * - 'front': Brings selected elements to the very top of their sibling stack.
 * - 'forward': Moves selected elements 1 step higher among their siblings.
 * - 'backward': Moves selected elements 1 step lower among their siblings.
 * - 'back': Sends selected elements to the very bottom of their sibling stack.
 */
export function reorderSiblingLayers(
  elements: ResultScreenElement[],
  targetIds: string | string[],
  direction: 'forward' | 'backward' | 'front' | 'back'
): ResultScreenElement[] {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  if (ids.length === 0) return elements;

  const targetIdSet = new Set(ids);

  const reorderList = (list: ResultScreenElement[]): ResultScreenElement[] => {
    const hasTargets = list.some((item) => targetIdSet.has(item.id));

    if (hasTargets) {
      // Sort list by existing order / zIndex
      const sorted = [...list];

      if (direction === 'front') {
        const targets = sorted.filter((item) => targetIdSet.has(item.id));
        const nonTargets = sorted.filter((item) => !targetIdSet.has(item.id));
        const reordered = [...nonTargets, ...targets];
        return reordered.map((item, idx) => ({ ...item, zIndex: idx + 1 }));
      } else if (direction === 'back') {
        const targets = sorted.filter((item) => targetIdSet.has(item.id));
        const nonTargets = sorted.filter((item) => !targetIdSet.has(item.id));
        const reordered = [...targets, ...nonTargets];
        return reordered.map((item, idx) => ({ ...item, zIndex: idx + 1 }));
      } else if (direction === 'forward') {
        const result = [...sorted];
        for (let i = result.length - 2; i >= 0; i--) {
          if (targetIdSet.has(result[i].id) && !targetIdSet.has(result[i + 1].id)) {
            const temp = result[i];
            result[i] = result[i + 1];
            result[i + 1] = temp;
          }
        }
        return result.map((item, idx) => ({ ...item, zIndex: idx + 1 }));
      } else if (direction === 'backward') {
        const result = [...sorted];
        for (let i = 1; i < result.length; i++) {
          if (targetIdSet.has(result[i].id) && !targetIdSet.has(result[i - 1].id)) {
            const temp = result[i];
            result[i] = result[i - 1];
            result[i - 1] = temp;
          }
        }
        return result.map((item, idx) => ({ ...item, zIndex: idx + 1 }));
      }
    }

    // Traverse recursively into containers
    return list.map((item) => {
      if (item.type === 'card' && (item as ResultCardElement).children) {
        return {
          ...item,
          children: reorderList((item as ResultCardElement).children || []),
        } as ResultCardElement;
      }
      if (item.type === 'group' && (item as ResultGroupElement).children) {
        return {
          ...item,
          children: reorderList((item as ResultGroupElement).children || []),
        } as ResultGroupElement;
      }
      return item;
    });
  };

  return reorderList(elements);
}

/**
 * Toggles or sets the lock state on specified elements.
 */
export function toggleElementsLock(
  elements: ResultScreenElement[],
  targetIds: string | string[],
  forcedState?: boolean
): ResultScreenElement[] {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  const targetIdSet = new Set(ids);

  const traverse = (list: ResultScreenElement[]): ResultScreenElement[] => {
    return list.map((item) => {
      let updated = item;
      if (targetIdSet.has(item.id)) {
        const newLock = forcedState !== undefined ? forcedState : !item.locked;
        updated = { ...item, locked: newLock } as ResultScreenElement;
      }
      if (updated.type === 'card' && (updated as ResultCardElement).children) {
        return {
          ...updated,
          children: traverse((updated as ResultCardElement).children || []),
        } as ResultCardElement;
      }
      if (updated.type === 'group' && (updated as ResultGroupElement).children) {
        return {
          ...updated,
          children: traverse((updated as ResultGroupElement).children || []),
        } as ResultGroupElement;
      }
      return updated;
    });
  };

  return traverse(elements);
}
