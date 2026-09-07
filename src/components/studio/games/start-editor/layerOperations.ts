import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
} from '../../../../games/shared/startScreenTypes';
import { findElementAndParent, isDescendantOf } from './types';

/**
 * Checks if the given selection of elements can be grouped.
 */
export function canGroupElements(
  elements: StartScreenElement[],
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
  elements: StartScreenElement[],
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
 * Groups the selected elements into a new StartScreenGroupElement.
 */
export function groupSelectedElements(
  elements: StartScreenElement[],
  selectedIds: string[]
): {
  newElements: StartScreenElement[];
  groupId: string | null;
} {
  if (!canGroupElements(elements, selectedIds)) {
    return { newElements: elements, groupId: null };
  }

  const firstInfo = findElementAndParent(selectedIds[0], elements);
  if (!firstInfo) return { newElements: elements, groupId: null };

  const parent = firstInfo.parent;
  const listToSearch = parent ? parent.children || [] : elements;

  const selectedElements = listToSearch.filter((el) => selectedIds.includes(el.id));
  if (selectedElements.length === 0) return { newElements: elements, groupId: null };

  // Calculate bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  selectedElements.forEach((el) => {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  });

  const groupWidth = Math.max(20, maxX - minX);
  const groupHeight = Math.max(20, maxY - minY);

  const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Remap child coordinates relative to new group
  const groupChildren: StartScreenElement[] = selectedElements.map((el) => ({
    ...el,
    x: el.x - minX,
    y: el.y - minY,
  }));

  const newGroup: StartScreenGroupElement = {
    id: groupId,
    type: 'group',
    x: minX,
    y: minY,
    width: groupWidth,
    height: groupHeight,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: Math.max(...selectedElements.map((e) => e.zIndex || 1)),
    children: groupChildren,
  };

  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    const isTargetContainer = parent ? false : true;
    if (isTargetContainer) {
      const remaining = items.filter((el) => !selectedIds.includes(el.id));
      const firstIndex = items.findIndex((el) => selectedIds.includes(el.id));
      const insertAt = firstIndex >= 0 ? firstIndex : remaining.length;
      const copy = [...remaining];
      copy.splice(insertAt, 0, newGroup);
      return copy;
    }

    return items.map((item) => {
      if (parent && item.id === parent.id) {
        const pChildren = (item as StartScreenCardElement | StartScreenGroupElement).children || [];
        const remaining = pChildren.filter((el) => !selectedIds.includes(el.id));
        const firstIndex = pChildren.findIndex((el) => selectedIds.includes(el.id));
        const insertAt = firstIndex >= 0 ? firstIndex : remaining.length;
        const copy = [...remaining];
        copy.splice(insertAt, 0, newGroup);
        return {
          ...item,
          children: copy,
        };
      }
      if (item.type === 'card' || item.type === 'group') {
        const children = (item as StartScreenCardElement | StartScreenGroupElement).children || [];
        return {
          ...item,
          children: updateList(children),
        };
      }
      return item;
    });
  };

  return {
    newElements: updateList(elements),
    groupId,
  };
}

/**
 * Ungroups the selected group element.
 */
export function ungroupSelectedElements(
  elements: StartScreenElement[],
  selectedIds: string[]
): {
  newElements: StartScreenElement[];
  unpackedIds: string[];
} {
  const unpackedIds: string[] = [];

  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    const result: StartScreenElement[] = [];

    for (const item of items) {
      if (selectedIds.includes(item.id) && item.type === 'group') {
        const group = item as StartScreenGroupElement;
        const children = group.children || [];
        const unpackedChildren = children.map((child) => {
          unpackedIds.push(child.id);
          return {
            ...child,
            x: group.x + child.x,
            y: group.y + child.y,
            zIndex: group.zIndex || child.zIndex,
          };
        });
        result.push(...unpackedChildren);
      } else if (item.type === 'card' || item.type === 'group') {
        const container = item as StartScreenCardElement | StartScreenGroupElement;
        result.push({
          ...container,
          children: updateList(container.children || []),
        });
      } else {
        result.push(item);
      }
    }

    return result;
  };

  return {
    newElements: updateList(elements),
    unpackedIds,
  };
}

/**
 * Reorders sibling layers (bring to front, send to back, bring forward, send backward).
 */
export function reorderSiblingLayers(
  elements: StartScreenElement[],
  elementId: string,
  direction: 'front' | 'back' | 'forward' | 'backward'
): StartScreenElement[] {
  const info = findElementAndParent(elementId, elements);
  if (!info) return elements;

  const parent = info.parent;

  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    const isTargetLevel = parent ? false : items.some((i) => i.id === elementId);

    if (isTargetLevel) {
      const idx = items.findIndex((i) => i.id === elementId);
      if (idx === -1) return items;

      const copy = [...items];
      const [item] = copy.splice(idx, 1);

      if (direction === 'front') {
        copy.push(item);
      } else if (direction === 'back') {
        copy.unshift(item);
      } else if (direction === 'forward') {
        const targetIdx = Math.min(copy.length, idx + 1);
        copy.splice(targetIdx, 0, item);
      } else if (direction === 'backward') {
        const targetIdx = Math.max(0, idx - 1);
        copy.splice(targetIdx, 0, item);
      }

      return copy.map((el, z) => ({ ...el, zIndex: z + 1 }));
    }

    return items.map((el) => {
      if (parent && el.id === parent.id) {
        const children = (el as StartScreenCardElement | StartScreenGroupElement).children || [];
        const idx = children.findIndex((c) => c.id === elementId);
        if (idx === -1) return el;

        const copy = [...children];
        const [item] = copy.splice(idx, 1);

        if (direction === 'front') {
          copy.push(item);
        } else if (direction === 'back') {
          copy.unshift(item);
        } else if (direction === 'forward') {
          const targetIdx = Math.min(copy.length, idx + 1);
          copy.splice(targetIdx, 0, item);
        } else if (direction === 'backward') {
          const targetIdx = Math.max(0, idx - 1);
          copy.splice(targetIdx, 0, item);
        }

        return {
          ...el,
          children: copy.map((c, z) => ({ ...c, zIndex: z + 1 })),
        };
      }

      if (el.type === 'card' || el.type === 'group') {
        const c = el as StartScreenCardElement | StartScreenGroupElement;
        return {
          ...el,
          children: updateList(c.children || []),
        };
      }

      return el;
    });
  };

  return updateList(elements);
}

/**
 * Moves an element to a new container or to the root canvas.
 */
export function moveElementToContainer(
  elements: StartScreenElement[],
  elementId: string,
  targetContainerId: string | null
): StartScreenElement[] {
  const info = findElementAndParent(elementId, elements);
  if (!info) return elements;

  const { element: elToMove, parent: sourceParent } = info;

  // Prevent moving into itself or its own descendants
  if (targetContainerId && (targetContainerId === elementId || isDescendantOf(targetContainerId, elementId, elements))) {
    return elements;
  }

  // 1. Remove element from source
  let removedEl: StartScreenElement | null = null;

  const removeFromSource = (items: StartScreenElement[]): StartScreenElement[] => {
    return items
      .filter((i) => {
        if (i.id === elementId) {
          removedEl = { ...i };
          return false;
        }
        return true;
      })
      .map((i) => {
        if (i.type === 'card' || i.type === 'group') {
          const c = i as StartScreenCardElement | StartScreenGroupElement;
          return {
            ...i,
            children: removeFromSource(c.children || []),
          };
        }
        return i;
      });
  };

  const elementsWithoutTarget = removeFromSource(elements);
  if (!removedEl) return elements;

  const itemToInsert = removedEl as StartScreenElement;

  // 2. Insert into root or target container
  if (!targetContainerId || targetContainerId === 'root') {
    return [...elementsWithoutTarget, itemToInsert];
  }

  const insertIntoTarget = (items: StartScreenElement[]): StartScreenElement[] => {
    return items.map((i) => {
      if (i.id === targetContainerId && (i.type === 'card' || i.type === 'group')) {
        const c = i as StartScreenCardElement | StartScreenGroupElement;
        return {
          ...i,
          children: [...(c.children || []), itemToInsert],
        };
      }
      if (i.type === 'card' || i.type === 'group') {
        const c = i as StartScreenCardElement | StartScreenGroupElement;
        return {
          ...i,
          children: insertIntoTarget(c.children || []),
        };
      }
      return i;
    });
  };

  return insertIntoTarget(elementsWithoutTarget);
}

/**
 * Duplicates an element with a unique ID and slight offset.
 */
export function duplicateElement(
  elements: StartScreenElement[],
  elementId: string
): {
  newElements: StartScreenElement[];
  duplicatedId: string | null;
} {
  const info = findElementAndParent(elementId, elements);
  if (!info) return { newElements: elements, duplicatedId: null };

  const { element: original, parent } = info;
  const newId = `${original.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const cloneWithNewIds = (el: StartScreenElement): StartScreenElement => {
    const clone = JSON.parse(JSON.stringify(el));
    clone.id = `${el.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (clone.type === 'card' || clone.type === 'group') {
      clone.children = (clone.children || []).map(cloneWithNewIds);
    }
    return clone;
  };

  const cloned = cloneWithNewIds(original);
  cloned.id = newId;
  cloned.x = Math.min(900, original.x + 20);
  cloned.y = Math.min(900, original.y + 20);

  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    const isTargetLevel = parent ? false : items.some((i) => i.id === elementId);

    if (isTargetLevel) {
      const idx = items.findIndex((i) => i.id === elementId);
      const copy = [...items];
      copy.splice(idx + 1, 0, cloned);
      return copy;
    }

    return items.map((i) => {
      if (parent && i.id === parent.id) {
        const c = (i as StartScreenCardElement | StartScreenGroupElement).children || [];
        const idx = c.findIndex((child) => child.id === elementId);
        const copy = [...c];
        copy.splice(idx + 1, 0, cloned);
        return { ...i, children: copy };
      }
      if (i.type === 'card' || i.type === 'group') {
        const c = i as StartScreenCardElement | StartScreenGroupElement;
        return { ...i, children: updateList(c.children || []) };
      }
      return i;
    });
  };

  return {
    newElements: updateList(elements),
    duplicatedId: newId,
  };
}

/**
 * Deletes one or more elements from the tree.
 */
export function deleteElements(
  elements: StartScreenElement[],
  idsToDelete: string[]
): StartScreenElement[] {
  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    return items
      .filter((i) => !idsToDelete.includes(i.id))
      .map((i) => {
        if (i.type === 'card' || i.type === 'group') {
          const c = i as StartScreenCardElement | StartScreenGroupElement;
          return {
            ...i,
            children: updateList(c.children || []),
          };
        }
        return i;
      });
  };

  return updateList(elements);
}

/**
 * Toggles the lock state of an element.
 */
export function toggleElementLock(
  elements: StartScreenElement[],
  elementId: string
): StartScreenElement[] {
  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    return items.map((i) => {
      if (i.id === elementId) {
        return { ...i, locked: !i.locked };
      }
      if (i.type === 'card' || i.type === 'group') {
        const c = i as StartScreenCardElement | StartScreenGroupElement;
        return {
          ...i,
          children: updateList(c.children || []),
        };
      }
      return i;
    });
  };

  return updateList(elements);
}

/**
 * Toggles the visibility of an element.
 */
export function toggleElementVisibility(
  elements: StartScreenElement[],
  elementId: string
): StartScreenElement[] {
  const updateList = (items: StartScreenElement[]): StartScreenElement[] => {
    return items.map((i) => {
      if (i.id === elementId) {
        return { ...i, visible: i.visible === false ? true : false };
      }
      if (i.type === 'card' || i.type === 'group') {
        const c = i as StartScreenCardElement | StartScreenGroupElement;
        return {
          ...i,
          children: updateList(c.children || []),
        };
      }
      return i;
    });
  };

  return updateList(elements);
}
