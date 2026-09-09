/** Hierarchical sparse filtering, inspired by tower120/hi_sparse_bitset. */

/* @inline @pure */ export function ctz32(value: number): number {
  return value === 0 ? 32 : 31 - Math.clz32(value & -value);
}

function popcount32(value: number): number {
  const a = value - ((value >>> 1) & 0x55555555);
  const b = (a & 0x33333333) + ((a >>> 2) & 0x33333333);
  return (((b + (b >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const _bitset_emptyBlock = /* @__PURE__ */ new Uint32Array(33);
const _bitset_emptySets: readonly HiSparseBitSet[] = [];

/**
 * Exact indices in [0, capacity), up to 2^22. These are slots, not packed entity handles.
 * Directories are allocated at creation. reserve() prepares leaf blocks for tryInsert().
 * Convenience insert() and setRange() may allocate a missing block. Blocks survive clear().
 * Callbacks may run nested reads but must not mutate the sets being visited.
 */
export class HiSparseBitSet {
  readonly capacity: number;
  l0: number;
  readonly l1Summary: Uint32Array;
  readonly l2Summary: Uint32Array;
  /** Each leaf has 32 data words followed by its nonempty-word mask. */
  readonly l2Blocks: (Uint32Array | null)[];
  private _size: number;

  constructor(capacity = 0x100000) {
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 0x400000)
      throw new RangeError('HiSparseBitSet: capacity must be an integer in [0, 2^22].');
    this.capacity = capacity;
    this.l0 = 0;
    this.l1Summary = new Uint32Array(Math.ceil(capacity / 0x100000));
    this.l2Summary = new Uint32Array(Math.ceil(capacity / 32768));
    this.l2Blocks = [];
    for (let i = 0, count = Math.ceil(capacity / 1024); i < count; i++) this.l2Blocks[i] = null;
    this._size = 0;
  }

  get size(): number {
    return this._size;
  }

  /** Prepare every leaf intersecting [start, end), outside the hot loop. */
  reserve(start = 0, end = this.capacity): void {
    this.validateRange(start, end);
    if (start === end) return;
    for (let i = start >>> 10, last = (end - 1) >>> 10; i <= last; i++)
      this.l2Blocks[i] ??= new Uint32Array(33);
  }

  /** 1 inserted, 0 already present, -1 unprepared leaf, -2 invalid index. */
  tryInsert(index: number): number {
    if (!this.valid(index)) return -2;
    const block = this.l2Blocks[index >>> 10];
    return block ? this.insertInto(block, index) : -1;
  }

  /** Invalid indices and duplicates return false without changing the set. */
  insert(index: number): boolean {
    if (!this.valid(index)) return false;
    const block = (this.l2Blocks[index >>> 10] ??= new Uint32Array(33));
    return this.insertInto(block, index) === 1;
  }

  private insertInto(block: Uint32Array, index: number): number {
    const word = (index >>> 5) & 31;
    const bit = 1 << (index & 31);
    const previous = block[word];
    if (previous & bit) return 0;
    block[word] = previous | bit;
    if (previous === 0) this.markWord(block, index, word);
    this._size++;
    return 1;
  }

  private markWord(block: Uint32Array, index: number, word: number): void {
    const words = block[32];
    block[32] = words | (1 << word);
    if (words !== 0) return;
    const group = index >>> 15;
    const leaves = this.l2Summary[group];
    this.l2Summary[group] = leaves | (1 << ((index >>> 10) & 31));
    if (leaves !== 0) return;
    const region = index >>> 20;
    const groups = this.l1Summary[region];
    this.l1Summary[region] = groups | (1 << (group & 31));
    if (groups === 0) this.l0 |= 1 << region;
  }

  remove(index: number): boolean {
    if (!this.valid(index)) return false;
    const blockIndex = index >>> 10;
    const block = this.l2Blocks[blockIndex];
    const word = (index >>> 5) & 31;
    const bit = 1 << (index & 31);
    if (!block || !(block[word] & bit)) return false;
    block[word] &= ~bit;
    this._size--;
    if (block[word] === 0) this.unmarkWord(block, index, word);
    return true;
  }

  private unmarkWord(block: Uint32Array, index: number, word: number): void {
    const blockIndex = index >>> 10;
    block[32] &= ~(1 << word);
    if (block[32] === 0) {
      const group = index >>> 15;
      this.l2Summary[group] &= ~(1 << (blockIndex & 31));
      if (this.l2Summary[group] === 0) {
        const region = index >>> 20;
        this.l1Summary[region] &= ~(1 << (group & 31));
        if (this.l1Summary[region] === 0) this.l0 &= ~(1 << region);
      }
    }
  }

  has(index: number): boolean {
    if (!this.valid(index)) return false;
    const block = this.l2Blocks[index >>> 10];
    return block !== null && (block[(index >>> 5) & 31] & (1 << (index & 31))) !== 0;
  }

  clear(): void {
    let regions = this.l0;
    while (regions) {
      const region = ctz32(regions);
      regions &= regions - 1;
      let groups = this.l1Summary[region];
      while (groups) {
        const group = (region << 5) | ctz32(groups);
        groups &= groups - 1;
        let leaves = this.l2Summary[group];
        while (leaves) {
          const leaf = (group << 5) | ctz32(leaves);
          leaves &= leaves - 1;
          this.l2Blocks[leaf]!.fill(0);
        }
        this.l2Summary[group] = 0;
      }
      this.l1Summary[region] = 0;
    }
    this.l0 = 0;
    this._size = 0;
  }

  /** Borrowed storage, including the leaf summary at offset 32. Do not mutate it. */
  getBlock(blockIndex: number): Uint32Array {
    return this.l2Blocks[blockIndex] ?? _bitset_emptyBlock;
  }

  clone(): HiSparseBitSet {
    const copy = new HiSparseBitSet(this.capacity);
    copy.l0 = this.l0;
    copy.l1Summary.set(this.l1Summary);
    copy.l2Summary.set(this.l2Summary);
    copy._size = this._size;
    for (let i = 0; i < this.l2Blocks.length; i++) {
      const block = this.l2Blocks[i];
      if (block) copy.l2Blocks[i] = new Uint32Array(block);
    }
    return copy;
  }

  forEach(callback: (index: number) => void): void {
    this.visit(callback, false);
  }

  /** Remove each index before calling back. A thrown callback leaves the remaining entries live. */
  drain(callback: (index: number) => void): void {
    this.visit(callback, true);
  }

  private visit(callback: (index: number) => void, drain: boolean): void {
    let regions = this.l0;
    while (regions) {
      const region = ctz32(regions);
      regions &= regions - 1;
      let groups = this.l1Summary[region];
      while (groups) {
        const group = (region << 5) | ctz32(groups);
        groups &= groups - 1;
        let leaves = this.l2Summary[group];
        while (leaves) {
          const leaf = (group << 5) | ctz32(leaves);
          leaves &= leaves - 1;
          const block = this.l2Blocks[leaf]!;
          let words = block[32];
          while (words) {
            const offset = ctz32(words);
            words &= words - 1;
            let word = block[offset];
            const base = (leaf << 10) | (offset << 5);
            if (drain) {
              while (word) {
                const index = base | ctz32(word);
                word &= word - 1;
                block[offset] = word;
                this._size--;
                if (word === 0) this.unmarkWord(block, index, offset);
                callback(index);
              }
            } else {
              while (word) {
                const index = base | ctz32(word);
                word &= word - 1;
                callback(index);
              }
            }
          }
        }
      }
    }
  }

  /** Add [start, end) and return the number added. Invalid ranges throw before writing. */
  setRange(start: number, end: number): number {
    this.validateRange(start, end);
    let added = 0;
    for (let index = start; index < end;) {
      const leaf = index >>> 10;
      const block = (this.l2Blocks[leaf] ??= new Uint32Array(33));
      const offset = (index >>> 5) & 31;
      const stop = Math.min(end, (index & ~31) + 32);
      const mask = (0xffffffff >>> (32 - (stop - index))) << (index & 31);
      const previous = block[offset];
      const next = (previous | mask) >>> 0;
      added += popcount32(next) - popcount32(previous);
      block[offset] = next;
      if (previous === 0) this.markWord(block, index, offset);
      index = stop;
    }
    this._size += added;
    return added;
  }

  private valid(index: number): boolean {
    return index === (index & 0x3fffff) && index < this.capacity;
  }

  private validateRange(start: number, end: number): void {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.capacity
    )
      throw new RangeError('HiSparseBitSet: invalid range.');
  }
}

/** Empty required input has no matches. Read-only nested calls need no scratch workspace. */
export function forEachIntersection(
  sets: readonly HiSparseBitSet[],
  callback: (index: number) => void
): number {
  return walkQuery(sets, _bitset_emptySets, callback, null);
}

export function forEachQuery(
  required: readonly HiSparseBitSet[],
  forbidden: readonly HiSparseBitSet[],
  callback: (index: number) => void
): number {
  return walkQuery(required, forbidden, callback, null);
}

/** Return the required count, writing only the caller's capacity. No allocation or resizing. */
export function collectQueryInto(
  required: readonly HiSparseBitSet[],
  forbidden: readonly HiSparseBitSet[],
  output: number[] | Uint32Array
): number {
  return walkQuery(required, forbidden, null, output);
}

function walkQuery(
  required: readonly HiSparseBitSet[],
  forbidden: readonly HiSparseBitSet[],
  callback: ((index: number) => void) | null,
  output: number[] | Uint32Array | null
): number {
  const n = required.length;
  if (n === 0) return 0;
  const excluded = forbidden.length;
  const limit = output?.length ?? 0;
  let count = 0;
  let regions = required[0].l0;
  for (let i = 1; i < n; i++) regions &= required[i].l0;
  while (regions) {
    const region = ctz32(regions);
    regions &= regions - 1;
    let groups = required[0].l1Summary[region];
    for (let i = 1; i < n; i++) groups &= required[i].l1Summary[region];
    while (groups) {
      const group = (region << 5) | ctz32(groups);
      groups &= groups - 1;
      let leaves = required[0].l2Summary[group];
      for (let i = 1; i < n; i++) leaves &= required[i].l2Summary[group];
      while (leaves) {
        const leaf = (group << 5) | ctz32(leaves);
        leaves &= leaves - 1;
        const first = required[0].l2Blocks[leaf]!;
        let words = first[32];
        for (let i = 1; i < n; i++) words &= required[i].l2Blocks[leaf]![32];
        while (words) {
          const offset = ctz32(words);
          words &= words - 1;
          let word = first[offset];
          for (let i = 1; i < n && word; i++) word &= required[i].l2Blocks[leaf]![offset];
          for (let i = 0; i < excluded && word; i++)
            word &= ~(forbidden[i].l2Blocks[leaf]?.[offset] ?? 0);
          const base = (leaf << 10) | (offset << 5);
          if (callback) {
            while (word) {
              const index = base | ctz32(word);
              word &= word - 1;
              callback(index);
              count++;
            }
          } else {
            while (word) {
              const index = base | ctz32(word);
              word &= word - 1;
              if (count < limit) output![count] = index;
              count++;
            }
          }
        }
      }
    }
  }
  return count;
}

/** Convenience snapshots allocate. Use collectQueryInto for bounded collection. */
export function collectIntersection(sets: readonly HiSparseBitSet[]): number[] {
  const output: number[] = [];
  forEachIntersection(sets, (index) => output.push(index));
  return output;
}

export function collectQuery(
  required: readonly HiSparseBitSet[],
  forbidden: readonly HiSparseBitSet[]
): number[] {
  const output: number[] = [];
  forEachQuery(required, forbidden, (index) => output.push(index));
  return output;
}
