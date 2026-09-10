/**
 * Shared Visual Editor Engine - Layer Operations & Tree Mutations
 * Generic grouping, ungrouping, layer reordering, duplicating, deleting, reparenting.
 */
import { BaseVisualElement, findElementAndParent, isDescendantOf } from './types';

/**
 * Checks if selected elements can be grouped.
 */
export function canGroupElements<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
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
 * Checks if any selected element is a Group that can be ungrouped.
 */
export function canUngroupElements<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
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

export interface GroupElementsResult<T> {
  updatedElements: T[];
  newElements: T[]; // alias for compatibility
  newGroupId: string | null;
  groupId: string | null; // alias for compatibility
}

/**
 * Groups multiple sibling elements into a new group container.
 */
export function groupElements<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetIds: string[]
): GroupElementsResult<T> {
  if (!canGroupElements(elements, targetIds)) {
    return {
      updatedElements: elements,
      newElements: elements,
      newGroupId: null,
      groupId: null,
    };
  }

  const firstInfo = findElementAndParent(targetIds[0], elements);
  if (!firstInfo) {
    return {
      updatedElements: elements,
      newElements: elements,
      newGroupId: null,
      groupId: null,
    };
  }

  const parent = firstInfo.parent;
  const targetIdSet = new Set(targetIds);

  const siblingList: T[] = parent ? (parent.children || []) : elements;
  const targetElements = siblingList.filter((el) => targetIdSet.has(el.id));

  if (targetElements.length < 2) {
    return {
      updatedElements: elements,
      newElements: elements,
      newGroupId: null,
      groupId: null,
    };
  }

  const minX = Math.min(...targetElements.map((e) => e.x));
  const minY = Math.min(...targetElements.map((e) => e.y));
  const maxX = Math.max(...targetElements.map((e) => e.x + e.width));
  const maxY = Math.max(...targetElements.map((e) => e.y + e.height));

  const groupWidth = Math.max(20, Math.round(maxX - minX));
  const groupHeight = Math.max(20, Math.round(maxY - minY));

  const convertedChildren: T[] = targetElements.map((child, idx) => ({
    ...child,
    x: Math.round(child.x - minX),
    y: Math.round(child.y - minY),
    zIndex: idx + 1,
  }));

  const newGroupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const insertIndex = siblingList.findIndex((el) => targetIdSet.has(el.id));

  const newGroup: any = {
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

  const newSiblingList: T[] = [];
  let groupInserted = false;

  for (const el of siblingList) {
    if (targetIdSet.has(el.id)) {
      if (!groupInserted) {
        newSiblingList.push(newGroup);
        groupInserted = true;
      }
    } else {
      newSiblingList.push(el);
    }
  }

  const updatedElements = parent
    ? updateContainerChildren(elements, parent.id, newSiblingList)
    : newSiblingList;

  return {
    updatedElements,
    newElements: updatedElements,
    newGroupId,
    groupId: newGroupId,
  };
}

export const groupSelectedElements = groupElements;

export interface UngroupElementsResult<T> {
  updatedElements: T[];
  newElements: T[]; // alias
  unpackedIds: string[];
}

/**
 * Ungroups selected group elements, lifting children back to the parent container.
 */
export function ungroupElements<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetIds: string[]
): UngroupElementsResult<T> {
  if (!targetIds || targetIds.length === 0) {
    return { updatedElements: elements, newElements: elements, unpackedIds: [] };
  }

  const unpackedIds: string[] = [];
  let currentElements = elements;

  for (const targetId of targetIds) {
    const info = findElementAndParent(targetId, currentElements);
    if (!info || info.element.type !== 'group') continue;

    const groupEl = info.element;
    const parentContainer = info.parent;
    const children: T[] = groupEl.children || [];

    const convertedChildren: T[] = children.map((child) => ({
      ...child,
      x: Math.round(groupEl.x + child.x),
      y: Math.round(groupEl.y + child.y),
    }));

    convertedChildren.forEach((c) => unpackedIds.push(c.id));

    const siblings: T[] = parentContainer ? (parentContainer.children || []) : currentElements;
    const groupIdx = siblings.findIndex((s) => s.id === targetId);

    if (groupIdx === -1) continue;

    const newSiblings = [
      ...siblings.slice(0, groupIdx),
      ...convertedChildren,
      ...siblings.slice(groupIdx + 1),
    ];

    currentElements = parentContainer
      ? updateContainerChildren(currentElements, parentContainer.id, newSiblings)
      : newSiblings;
  }

  return {
    updatedElements: currentElements,
    newElements: currentElements,
    unpackedIds,
  };
}

export const ungroupSelectedElements = ungroupElements;

/**
 * Reorders elements within their sibling layer list.
 */
export function reorderSiblingLayers<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetIds: string | string[],
  direction: 'forward' | 'backward' | 'front' | 'back'
): T[] {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  if (ids.length === 0) return elements;

  const idSet = new Set(ids);
  const firstInfo = findElementAndParent(ids[0], elements);
  if (!firstInfo) return elements;

  const parent = firstInfo.parent;
  const siblings: T[] = parent ? (parent.children || []) : elements;

  const targetIndices = ids
    .map((id) => siblings.findIndex((s) => s.id === id))
    .filter((idx) => idx !== -1)
    .sort((a, b) => a - b);

  if (targetIndices.length === 0) return elements;

  const nextSiblings = [...siblings];

  if (direction === 'forward') {
    for (let i = targetIndices.length - 1; i >= 0; i--) {
      const idx = targetIndices[i];
      if (idx < nextSiblings.length - 1 && !idSet.has(nextSiblings[idx + 1].id)) {
        const temp = nextSiblings[idx];
        nextSiblings[idx] = nextSiblings[idx + 1];
        nextSiblings[idx + 1] = temp;
      }
    }
  } else if (direction === 'backward') {
    for (let i = 0; i < targetIndices.length; i++) {
      const idx = targetIndices[i];
      if (idx > 0 && !idSet.has(nextSiblings[idx - 1].id)) {
        const temp = nextSiblings[idx];
        nextSiblings[idx] = nextSiblings[idx - 1];
        nextSiblings[idx - 1] = temp;
      }
    }
  } else if (direction === 'front') {
    const selected = nextSiblings.filter((s) => idSet.has(s.id));
    const rest = nextSiblings.filter((s) => !idSet.has(s.id));
    nextSiblings.length = 0;
    nextSiblings.push(...rest, ...selected);
  } else if (direction === 'back') {
    const selected = nextSiblings.filter((s) => idSet.has(s.id));
    const rest = nextSiblings.filter((s) => !idSet.has(s.id));
    nextSiblings.length = 0;
    nextSiblings.push(...selected, ...rest);
  }

  return parent
    ? updateContainerChildren(elements, parent.id, nextSiblings)
    : nextSiblings;
}

/**
 * Moves an element to a new container (or root if null), adjusting coordinates appropriately.
 */
export function moveElementToContainer<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  elementId: string,
  targetContainerId: string | null
): T[] {
  const info = findElementAndParent(elementId, elements);
  if (!info) return elements;

  const { element, parent: currentParent } = info;
  const currentParentId = currentParent ? currentParent.id : null;

  if (currentParentId === targetContainerId) return elements;

  // Prevent moving a container into itself or its descendants
  if (targetContainerId && isDescendantOf(targetContainerId, elementId, elements)) {
    return elements;
  }

  // Calculate absolute coordinates in canvas space
  let absX = element.x;
  let absY = element.y;
  let p = currentParent;
  while (p) {
    absX += p.x;
    absY += p.y;
    const nextP = findElementAndParent(p.id, elements);
    p = nextP ? nextP.parent : null;
  }

  // Remove element from current parent
  const withoutEl = removeElementFromTree(elements, elementId);

  // Calculate coordinates relative to target container
  let targetAbsX = 0;
  let targetAbsY = 0;
  let targetContainer: T | null = null;

  if (targetContainerId) {
    const tInfo = findElementAndParent(targetContainerId, withoutEl);
    if (!tInfo) return elements;
    targetContainer = tInfo.element;

    let tp: T | null = targetContainer;
    while (tp) {
      targetAbsX += tp.x;
      targetAbsY += tp.y;
      const nextTp = findElementAndParent(tp.id, withoutEl);
      tp = nextTp ? nextTp.parent : null;
    }
  }

  const relX = Math.round(absX - targetAbsX);
  const relY = Math.round(absY - targetAbsY);

  const updatedEl: T = {
    ...element,
    x: Math.max(0, relX),
    y: Math.max(0, relY),
  };

  if (!targetContainerId) {
    return [...withoutEl, updatedEl];
  }

  return addChildToContainer(withoutEl, targetContainerId, updatedEl);
}

export interface DuplicateElementResult<T> {
  updatedElements: T[];
  newElements: T[]; // alias
  newElementId: string | null;
  duplicatedId: string | null; // alias for compatibility
}

/**
 * Duplicates an element with a 20px offset and unique IDs.
 */
export function duplicateElement<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetId: string
): DuplicateElementResult<T> {
  const info = findElementAndParent(targetId, elements);
  if (!info) {
    return { updatedElements: elements, newElements: elements, newElementId: null, duplicatedId: null };
  }

  const { element, parent } = info;
  const newElementId = `${element.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  function cloneWithNewIds(el: T, isRootDupe = false): T {
    const id = isRootDupe
      ? newElementId
      : `${el.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const cloned: any = {
      ...el,
      id,
      x: isRootDupe ? el.x + 20 : el.x,
      y: isRootDupe ? el.y + 20 : el.y,
    };

    if (Array.isArray(el.children)) {
      cloned.children = el.children.map((c: T) => cloneWithNewIds(c, false));
    }

    return cloned as T;
  }

  const duplicated = cloneWithNewIds(element, true);

  if (!parent) {
    const idx = elements.findIndex((e) => e.id === targetId);
    const nextElements = [...elements];
    nextElements.splice(idx + 1, 0, duplicated);
    return {
      updatedElements: nextElements,
      newElements: nextElements,
      newElementId,
      duplicatedId: newElementId,
    };
  }

  const siblings = parent.children || [];
  const idx = siblings.findIndex((s) => s.id === targetId);
  const nextSiblings = [...siblings];
  nextSiblings.splice(idx + 1, 0, duplicated);

  const updatedElements = updateContainerChildren(elements, parent.id, nextSiblings);
  return {
    updatedElements,
    newElements: updatedElements,
    newElementId,
    duplicatedId: newElementId,
  };
}

/**
 * Deletes one or more elements from the tree by ID.
 */
export function deleteElements<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetIds: string | string[]
): T[] {
  const idSet = new Set(Array.isArray(targetIds) ? targetIds : [targetIds]);
  if (idSet.size === 0) return elements;

  function filterTree(list: T[]): T[] {
    return list
      .filter((item) => !idSet.has(item.id))
      .map((item) => {
        if (Array.isArray(item.children) && item.children.length > 0) {
          return {
            ...item,
            children: filterTree(item.children as T[]),
          };
        }
        return item;
      });
  }

  return filterTree(elements);
}

/**
 * Toggles the lock state of a single element.
 */
export function toggleElementLock<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetId: string
): T[] {
  function mapTree(list: T[]): T[] {
    return list.map((item) => {
      if (item.id === targetId) {
        return { ...item, locked: !item.locked };
      }
      if (Array.isArray(item.children)) {
        return { ...item, children: mapTree(item.children as T[]) };
      }
      return item;
    });
  }
  return mapTree(elements);
}

/**
 * Toggles lock state for multiple elements.
 */
export function toggleElementsLock<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetIds: string | string[],
  forcedState?: boolean
): T[] {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  const idSet = new Set(ids);
  const anyUnlocked = elements.some((el) => idSet.has(el.id) && !el.locked);
  const targetLocked = forcedState !== undefined ? forcedState : anyUnlocked;

  function mapTree(list: T[]): T[] {
    return list.map((item) => {
      let current = item;
      if (idSet.has(item.id)) {
        current = { ...item, locked: targetLocked };
      }
      if (Array.isArray(item.children)) {
        current = { ...current, children: mapTree(item.children as T[]) };
      }
      return current;
    });
  }
  return mapTree(elements);
}

/**
 * Toggles visibility of an element.
 */
export function toggleElementVisibility<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  targetId: string
): T[] {
  function mapTree(list: T[]): T[] {
    return list.map((item) => {
      if (item.id === targetId) {
        return { ...item, visible: item.visible === false };
      }
      if (Array.isArray(item.children)) {
        return { ...item, children: mapTree(item.children as T[]) };
      }
      return item;
    });
  }
  return mapTree(elements);
}

// ---------------- Helper Functions ----------------

function updateContainerChildren<T extends BaseVisualElement>(
  list: T[],
  containerId: string,
  newChildren: T[]
): T[] {
  return list.map((item) => {
    if (item.id === containerId) {
      return { ...item, children: newChildren };
    }
    if (Array.isArray(item.children)) {
      return { ...item, children: updateContainerChildren(item.children as T[], containerId, newChildren) };
    }
    return item;
  });
}

function removeElementFromTree<T extends BaseVisualElement>(
  list: T[],
  targetId: string
): T[] {
  return list
    .filter((item) => item.id !== targetId)
    .map((item) => {
      if (Array.isArray(item.children)) {
        return { ...item, children: removeElementFromTree(item.children as T[], targetId) };
      }
      return item;
    });
}

function addChildToContainer<T extends BaseVisualElement>(
  list: T[],
  containerId: string,
  child: T
): T[] {
  return list.map((item) => {
    if (item.id === containerId) {
      return {
        ...item,
        children: [...(item.children || []), child],
      };
    }
    if (Array.isArray(item.children)) {
      return {
        ...item,
        children: addChildToContainer(item.children as T[], containerId, child),
      };
    }
    return item;
  });
}
