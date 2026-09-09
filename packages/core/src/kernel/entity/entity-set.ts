/** Dense integer values with a bounded hash index, independent of handle magnitude. */
export type SparseSet = { dense: number[]; table: Int32Array; size: number };

export function createSparseSet(capacity = 16): SparseSet {
  const set = { dense: [] as number[], table: new Int32Array(0), size: 0 };
  reserveSparse(set, Math.max(1, capacity));
  return set;
}

export function reserveSparse(set: SparseSet, capacity: number): void {
  if (capacity <= set.dense.length) return;
  while (set.dense.length < capacity) set.dense.push(0);
  set.table = new Int32Array(2 ** Math.ceil(Math.log2(capacity * 2)));
  for (let i = 0; i < set.size; i++) set.table[bucketFor(set, set.dense[i])] = i + 1;
}

function home(value: number, mask: number): number {
  return Math.imul(value ^ (value >>> 16), 0x9e3779b1) & mask;
}

function bucketFor(set: SparseSet, value: number): number {
  const mask = set.table.length - 1;
  let bucket = home(value, mask);
  while (set.table[bucket] && set.dense[set.table[bucket] - 1] !== value)
    bucket = (bucket + 1) & mask;
  return bucket;
}

export function hasSparse(set: SparseSet, value: number): boolean {
  return set.table[bucketFor(set, value)] !== 0;
}

export function addSparse(set: SparseSet, value: number): boolean {
  let bucket = bucketFor(set, value);
  if (set.table[bucket]) return false;
  if (set.size === set.dense.length) {
    reserveSparse(set, set.dense.length * 2);
    bucket = bucketFor(set, value);
  }
  const index = set.size++;
  set.dense[index] = value;
  set.table[bucket] = index + 1;
  return true;
}

export function removeSparse(set: SparseSet, value: number): boolean {
  let hole = bucketFor(set, value);
  const entry = set.table[hole];
  if (!entry) return false;
  const mask = set.table.length - 1;
  let bucket = (hole + 1) & mask;
  while (set.table[bucket]) {
    const candidate = set.table[bucket];
    const start = home(set.dense[candidate - 1], mask);
    if (((bucket - start) & mask) >= ((bucket - hole) & mask)) {
      set.table[hole] = candidate;
      hole = bucket;
    }
    bucket = (bucket + 1) & mask;
  }
  set.table[hole] = 0;
  const last = set.dense[--set.size];
  if (entry - 1 !== set.size) {
    const lastBucket = bucketFor(set, last);
    set.dense[entry - 1] = last;
    set.table[lastBucket] = entry;
  }
  return true;
}

export function clearSparse(set: SparseSet): void {
  set.size = 0;
  set.table.fill(0);
}
