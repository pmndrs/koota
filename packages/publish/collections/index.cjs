"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/collections.ts
var collections_exports = {};
__export(collections_exports, {
  Deque: () => Deque,
  HiSparseBitSet: () => HiSparseBitSet,
  SparseSet: () => SparseSet,
  collectIntersection: () => collectIntersection,
  collectQuery: () => collectQuery,
  ctz32: () => ctz32,
  forEachIntersection: () => forEachIntersection,
  forEachQuery: () => forEachQuery
});
module.exports = __toCommonJS(collections_exports);

// ../collections/src/deque.ts
var Deque = class {
  #removed = [];
  #removedOut = [];
  dequeue() {
    if (this.#removedOut.length === 0) {
      while (this.#removed.length > 0) {
        this.#removedOut.push(this.#removed.pop());
      }
    }
    if (this.#removedOut.length === 0) {
      throw new Error("Queue is empty");
    }
    return this.#removedOut.pop();
  }
  enqueue(...items) {
    this.#removed.push(...items);
  }
  get length() {
    return this.#removed.length + this.#removedOut.length;
  }
  clear() {
    this.#removed.length = 0;
    this.#removedOut.length = 0;
  }
};

// ../collections/src/sparse-set.ts
var SparseSet = class {
  _dense = [];
  _sparse = [];
  _cursor = 0;
  _denseRaw = {
    array: this._dense,
    length: 0
  };
  has(val) {
    const index = this._sparse[val];
    return index < this._cursor && this._dense[index] === val;
  }
  add(val) {
    if (this.has(val)) return;
    this._sparse[val] = this._cursor;
    this._dense[this._cursor++] = val;
  }
  remove(val) {
    if (!this.has(val)) return;
    const index = this._sparse[val];
    this._cursor--;
    const swapped = this._dense[this._cursor];
    if (swapped !== val) {
      this._dense[index] = swapped;
      this._sparse[swapped] = index;
    }
  }
  clear() {
    for (let i = 0; i < this._cursor; i++) {
      this._sparse[this._dense[i]] = 0;
    }
    this._cursor = 0;
  }
  sort() {
    this._dense.sort((a, b) => a - b);
    for (let i = 0; i < this._dense.length; i++) {
      this._sparse[this._dense[i]] = i;
    }
  }
  getIndex(val) {
    return this._sparse[val];
  }
  get dense() {
    return this._dense.slice(0, this._cursor);
  }
  get denseRaw() {
    this._denseRaw.length = this._cursor;
    return this._denseRaw;
  }
  get rawDense() {
    return this._dense;
  }
  get length() {
    return this._cursor;
  }
  get sparse() {
    return this._sparse;
  }
};

// ../collections/src/hi-sparse-bitset.ts
function ctz32(v) {
  if (v === 0) return 32;
  return 31 - Math.clz32(v & -v);
}
var EMPTY_BLOCK = new Uint32Array(32);
var HiSparseBitSet = class _HiSparseBitSet {
  /** L0 summary: bit i set means l1Summary[i] has data. */
  l0 = 0;
  /** L1 summary: l1Summary[l0i] bit j set means l2 block (l0i*32 + j) has data. */
  l1Summary = new Uint32Array(32);
  /** L2 data blocks. l2Blocks[l1i] is a 32-element Uint32Array (pre-allocated to 32 null slots). */
  l2Blocks = new Array(32).fill(null);
  _size = 0;
  get size() {
    return this._size;
  }
  /** Insert an entity index into the set. O(1) amortized. */
  insert(index) {
    const l0i = index >>> 15;
    const l1i = index >>> 10 & 31;
    const blockIdx = l0i === 0 ? l1i : l0i << 5 | l1i;
    let block = this.l2Blocks[blockIdx];
    if (block === null || block === void 0) {
      block = new Uint32Array(32);
      this.l2Blocks[blockIdx] = block;
    }
    const l2i = index >>> 5 & 31;
    const mask = 1 << (index & 31);
    const word = block[l2i];
    if ((word & mask) === 0) {
      block[l2i] = word | mask;
      this.l1Summary[l0i] |= 1 << l1i;
      this.l0 |= 1 << l0i;
      this._size++;
    }
  }
  /** Remove an entity index from the set. O(1). */
  remove(index) {
    const l0i = index >>> 15;
    const l1i = index >>> 10 & 31;
    const blockIdx = l0i === 0 ? l1i : l0i << 5 | l1i;
    const block = this.l2Blocks[blockIdx];
    if (block === null || block === void 0) return;
    const l2i = index >>> 5 & 31;
    const mask = 1 << (index & 31);
    const word = block[l2i];
    if ((word & mask) !== 0) {
      block[l2i] = word & ~mask;
      this._size--;
      if (block[l2i] === 0) {
        let blockEmpty = true;
        for (let i = 0; i < 32; i++) {
          if (block[i] !== 0) {
            blockEmpty = false;
            break;
          }
        }
        if (blockEmpty) {
          this.l1Summary[l0i] &= ~(1 << l1i);
          if (this.l1Summary[l0i] === 0) {
            this.l0 &= ~(1 << l0i);
          }
        }
      }
    }
  }
  /** Test membership. O(1). */
  has(index) {
    const l0i = index >>> 15;
    const blockIdx = l0i === 0 ? index >>> 10 & 31 : l0i << 5 | index >>> 10 & 31;
    const block = this.l2Blocks[blockIdx];
    if (block === null || block === void 0) return false;
    return (block[index >>> 5 & 31] & 1 << (index & 31)) !== 0;
  }
  /** Clear all entries. */
  clear() {
    this.l0 = 0;
    this.l1Summary.fill(0);
    for (let i = 0; i < this.l2Blocks.length; i++) {
      const block = this.l2Blocks[i];
      if (block !== null && block !== void 0) block.fill(0);
    }
    this._size = 0;
  }
  /** Get L2 data block for branchless reads. Returns EMPTY_BLOCK if not allocated. */
  getBlock(blockIdx) {
    return this.l2Blocks[blockIdx] ?? EMPTY_BLOCK;
  }
  /** Create a deep copy of this bitset. */
  clone() {
    const copy = new _HiSparseBitSet();
    copy.l0 = this.l0;
    copy.l1Summary = new Uint32Array(this.l1Summary);
    copy._size = this._size;
    for (let i = 0; i < this.l2Blocks.length; i++) {
      const block = this.l2Blocks[i];
      if (block !== null && block !== void 0) {
        copy.l2Blocks[i] = new Uint32Array(block);
      }
    }
    return copy;
  }
  /** Iterate all set indices in sorted order via callback. Zero allocation. */
  forEach(callback) {
    let l0Bits = this.l0;
    while (l0Bits !== 0) {
      let result_ctz32_0_$f;
      if (l0Bits === 0) {
        result_ctz32_0_$f = 32;
      } else {
        result_ctz32_0_$f = 31 - Math.clz32(l0Bits & -l0Bits);
      }
      const l0i = result_ctz32_0_$f;
      l0Bits &= l0Bits - 1;
      let l1Bits = this.l1Summary[l0i];
      while (l1Bits !== 0) {
        let result_ctz32_1_$f;
        if (l1Bits === 0) {
          result_ctz32_1_$f = 32;
        } else {
          result_ctz32_1_$f = 31 - Math.clz32(l1Bits & -l1Bits);
        }
        const l1i = result_ctz32_1_$f;
        l1Bits &= l1Bits - 1;
        const blockIdx = l0i << 5 | l1i;
        const block = this.l2Blocks[blockIdx];
        for (let l2i = 0; l2i < 32; l2i++) {
          let word = block[l2i];
          if (word === 0) continue;
          const base = l0i << 15 | l1i << 10 | l2i << 5;
          while (word !== 0) {
            let result_ctz32_2_$f;
            if (word === 0) {
              result_ctz32_2_$f = 32;
            } else {
              result_ctz32_2_$f = 31 - Math.clz32(word & -word);
            }
            const bit = result_ctz32_2_$f;
            word &= word - 1;
            callback(base | bit);
          }
        }
      }
    }
  }
  /** Iterate all set bits in ascending order AND clear them. After drain the bitset is empty. */
  drain(callback) {
    let l0Bits = this.l0;
    if (l0Bits === 0) return;
    while (l0Bits !== 0) {
      let result_ctz32_3_$f;
      if (l0Bits === 0) {
        result_ctz32_3_$f = 32;
      } else {
        result_ctz32_3_$f = 31 - Math.clz32(l0Bits & -l0Bits);
      }
      const l0i = result_ctz32_3_$f;
      l0Bits &= l0Bits - 1;
      let l1Bits = this.l1Summary[l0i];
      while (l1Bits !== 0) {
        let result_ctz32_4_$f;
        if (l1Bits === 0) {
          result_ctz32_4_$f = 32;
        } else {
          result_ctz32_4_$f = 31 - Math.clz32(l1Bits & -l1Bits);
        }
        const l1i = result_ctz32_4_$f;
        l1Bits &= l1Bits - 1;
        const blockIdx = l0i << 5 | l1i;
        const block = this.l2Blocks[blockIdx];
        for (let l2i = 0; l2i < 32; l2i++) {
          let word = block[l2i];
          if (word === 0) continue;
          const base = l0i << 15 | l1i << 10 | l2i << 5;
          while (word !== 0) {
            let result_ctz32_5_$f;
            if (word === 0) {
              result_ctz32_5_$f = 32;
            } else {
              result_ctz32_5_$f = 31 - Math.clz32(word & -word);
            }
            const bit = result_ctz32_5_$f;
            word &= word - 1;
            callback(base | bit);
          }
          block[l2i] = 0;
        }
      }
      this.l1Summary[l0i] = 0;
    }
    this.l0 = 0;
    this._size = 0;
  }
  /**
   * Set a contiguous range [start, end) using word-level ops.
   * A 100-entity subtree = ~3 word fills + 2 partial ORs vs 100 individual insert() calls.
   */
  setRange(start, end) {
    if (start >= end) return;
    for (let idx = start; idx < end; ) {
      const l0i = idx >>> 15;
      const l1i = idx >>> 10 & 31;
      const l2i = idx >>> 5 & 31;
      const bit = idx & 31;
      const blockIdx = l0i << 5 | l1i;
      let block = this.l2Blocks[blockIdx];
      if (block === null || block === void 0) {
        block = new Uint32Array(32);
        this.l2Blocks[blockIdx] = block;
      }
      const wordEnd = Math.min(end, (idx & ~31) + 32);
      const count = wordEnd - idx;
      if (bit === 0 && count >= 32) {
        const prev = block[l2i];
        if (prev !== ~0 >>> 0) {
          const a_6_$f = prev - (prev >>> 1 & 1431655765);
          const b_6_$f = (a_6_$f & 858993459) + (a_6_$f >>> 2 & 858993459);
          const added = 32 - ((b_6_$f + (b_6_$f >>> 4) & 252645135) * 16843009 >>> 24);
          block[l2i] = ~0 >>> 0;
          this._size += added;
        }
      } else {
        const endBit = bit + count - 1;
        const mask = (2 << endBit) - 1 & ~((1 << bit) - 1);
        const prev = block[l2i];
        const newWord = prev | mask;
        if (newWord !== prev) {
          const a_7_$f = newWord - (newWord >>> 1 & 1431655765);
          const b_7_$f = (a_7_$f & 858993459) + (a_7_$f >>> 2 & 858993459);
          const a_8_$f = prev - (prev >>> 1 & 1431655765);
          const b_8_$f = (a_8_$f & 858993459) + (a_8_$f >>> 2 & 858993459);
          this._size += ((b_7_$f + (b_7_$f >>> 4) & 252645135) * 16843009 >>> 24) - ((b_8_$f + (b_8_$f >>> 4) & 252645135) * 16843009 >>> 24);
          block[l2i] = newWord;
        }
      }
      this.l1Summary[l0i] |= 1 << l1i;
      this.l0 |= 1 << l0i;
      idx = wordEnd;
    }
  }
};
function forEachIntersection(sets, callback) {
  const n = sets.length;
  if (n === 0) return 0;
  let count = 0;
  const allL2Blocks = new Array(n);
  for (let i = 0; i < n; i++) allL2Blocks[i] = sets[i].l2Blocks;
  let l0Combined = ~0 >>> 0;
  for (let i = 0; i < n; i++) l0Combined &= sets[i].l0;
  while (l0Combined !== 0) {
    let result_ctz32_9_$f;
    if (l0Combined === 0) {
      result_ctz32_9_$f = 32;
    } else {
      result_ctz32_9_$f = 31 - Math.clz32(l0Combined & -l0Combined);
    }
    const l0i = result_ctz32_9_$f;
    l0Combined &= l0Combined - 1;
    let l1Combined = ~0 >>> 0;
    for (let i = 0; i < n; i++) l1Combined &= sets[i].l1Summary[l0i];
    while (l1Combined !== 0) {
      let result_ctz32_10_$f;
      if (l1Combined === 0) {
        result_ctz32_10_$f = 32;
      } else {
        result_ctz32_10_$f = 31 - Math.clz32(l1Combined & -l1Combined);
      }
      const l1i = result_ctz32_10_$f;
      l1Combined &= l1Combined - 1;
      const blockIdx = l0i << 5 | l1i;
      let skipBlock = false;
      for (let i = 0; i < n; i++) {
        const blk = allL2Blocks[i][blockIdx];
        if (blk === null || blk === void 0) {
          skipBlock = true;
          break;
        }
      }
      if (skipBlock) continue;
      for (let l2i = 0; l2i < 32; l2i++) {
        let word = ~0 >>> 0;
        for (let i = 0; i < n; i++) {
          word &= allL2Blocks[i][blockIdx][l2i];
          if (word === 0) break;
        }
        if (word === 0) continue;
        const base = l0i << 15 | l1i << 10 | l2i << 5;
        while (word !== 0) {
          let result_ctz32_11_$f;
          if (word === 0) {
            result_ctz32_11_$f = 32;
          } else {
            result_ctz32_11_$f = 31 - Math.clz32(word & -word);
          }
          const bit = result_ctz32_11_$f;
          word &= word - 1;
          callback(base | bit);
          count++;
        }
      }
    }
  }
  return count;
}
function forEachQuery(required, forbidden, callback) {
  const nReq = required.length;
  const nForb = forbidden.length;
  if (nReq === 0) return 0;
  let count = 0;
  const reqL2 = new Array(nReq);
  for (let i = 0; i < nReq; i++) reqL2[i] = required[i].l2Blocks;
  const forbL2 = new Array(nForb);
  for (let i = 0; i < nForb; i++) forbL2[i] = forbidden[i].l2Blocks;
  let l0Combined = ~0 >>> 0;
  for (let i = 0; i < nReq; i++) l0Combined &= required[i].l0;
  while (l0Combined !== 0) {
    let result_ctz32_12_$f;
    if (l0Combined === 0) {
      result_ctz32_12_$f = 32;
    } else {
      result_ctz32_12_$f = 31 - Math.clz32(l0Combined & -l0Combined);
    }
    const l0i = result_ctz32_12_$f;
    l0Combined &= l0Combined - 1;
    let l1Combined = ~0 >>> 0;
    for (let i = 0; i < nReq; i++) l1Combined &= required[i].l1Summary[l0i];
    while (l1Combined !== 0) {
      let result_ctz32_13_$f;
      if (l1Combined === 0) {
        result_ctz32_13_$f = 32;
      } else {
        result_ctz32_13_$f = 31 - Math.clz32(l1Combined & -l1Combined);
      }
      const l1i = result_ctz32_13_$f;
      l1Combined &= l1Combined - 1;
      const blockIdx = l0i << 5 | l1i;
      let skipBlock = false;
      for (let i = 0; i < nReq; i++) {
        const blk = reqL2[i][blockIdx];
        if (blk === null || blk === void 0) {
          skipBlock = true;
          break;
        }
      }
      if (skipBlock) continue;
      for (let l2i = 0; l2i < 32; l2i++) {
        let word = ~0 >>> 0;
        for (let i = 0; i < nReq; i++) {
          word &= reqL2[i][blockIdx][l2i];
          if (word === 0) break;
        }
        if (word !== 0) {
          for (let i = 0; i < nForb; i++) {
            const fBlock = forbL2[i][blockIdx];
            if (fBlock !== null && fBlock !== void 0) {
              word &= ~fBlock[l2i];
              if (word === 0) break;
            }
          }
        }
        if (word === 0) continue;
        const base = l0i << 15 | l1i << 10 | l2i << 5;
        while (word !== 0) {
          let result_ctz32_14_$f;
          if (word === 0) {
            result_ctz32_14_$f = 32;
          } else {
            result_ctz32_14_$f = 31 - Math.clz32(word & -word);
          }
          const bit = result_ctz32_14_$f;
          word &= word - 1;
          callback(base | bit);
          count++;
        }
      }
    }
  }
  return count;
}
function collectIntersection(sets) {
  const result = [];
  forEachIntersection(sets, (eid) => result.push(eid));
  return result;
}
function collectQuery(required, forbidden) {
  const result = [];
  forEachQuery(required, forbidden, (eid) => result.push(eid));
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Deque,
  HiSparseBitSet,
  SparseSet,
  collectIntersection,
  collectQuery,
  ctz32,
  forEachIntersection,
  forEachQuery
});
