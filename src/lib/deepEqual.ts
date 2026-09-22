/**
 * Canonical deep equality comparison for JSON-compatible objects and theme configurations.
 * Compares primitives, arrays, nested objects, and handles key-order invariance cleanly.
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
    return true;
  }

  if (a == null || b == null) {
    return a === b;
  }

  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a).filter((k) => a[k] !== undefined);
  const bKeys = Object.keys(b).filter((k) => b[k] !== undefined);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) && b[key] === undefined) {
      return false;
    }
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}
