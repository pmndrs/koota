/**
 * Sparse set of non-negative integers.
 *
 * Exposed as plain data plus free functions rather than a class: hot loops in
 * the ECS kernel read `dense` directly, so it has to be a field. A `dense`
 * getter that returns a copy turns an indexed loop into one allocation per
 * iteration.
 */
export type SparseSet = {
  /** Packed values, in insertion order. Safe to read directly; do not mutate. */
  dense: number[];
  /** value -> index into `dense`. Entries for absent values are meaningless. */
  sparse: number[];
};

export function createSparseSet(): SparseSet {
  return { dense: [], sparse: [] };
}

export function hasSparse(set: SparseSet, value: number): boolean {
  const index = set.sparse[value];
  return index < set.dense.length && set.dense[index] === value;
}

export function addSparse(set: SparseSet, value: number): void {
  if (hasSparse(set, value)) return;
  set.sparse[value] = set.dense.length;
  set.dense.push(value);
}

export function removeSparse(set: SparseSet, value: number): void {
  if (!hasSparse(set, value)) return;
  const index = set.sparse[value];
  const last = set.dense.pop()!;
  if (last !== value) {
    set.dense[index] = last;
    set.sparse[last] = index;
  }
}

/**
 * Stale `sparse` entries are left behind deliberately: `hasSparse` bounds-checks
 * against `dense.length`, so they can never read as present, and skipping the
 * cleanup keeps this O(1) instead of O(size).
 */
export function clearSparse(set: SparseSet): void {
  set.dense.length = 0;
}

export function sortSparse(set: SparseSet): void {
  set.dense.sort((a, b) => a - b);
  for (let i = 0; i < set.dense.length; i++) {
    set.sparse[set.dense[i]] = i;
  }
}
