import { beforeEach, describe, expect, it } from 'vitest';
import {
  HiSparseBitSet,
  collectIntersection,
  collectQuery,
  collectQueryInto,
  forEachQuery,
  ctz32,
} from '../src';

function collect(set: HiSparseBitSet): number[] {
  const out: number[] = [];
  set.forEach((i) => out.push(i));
  return out;
}

describe('ctz32', () => {
  it('handles zero and powers of two', () => {
    expect(ctz32(0)).toBe(32);
    expect(ctz32(1)).toBe(0);
    expect(ctz32(0b1000)).toBe(3);
    expect(ctz32(1 << 31)).toBe(31);
  });
});

describe('HiSparseBitSet', () => {
  let set: HiSparseBitSet;

  beforeEach(() => {
    set = new HiSparseBitSet();
  });

  it('insert / has / size basics', () => {
    set.insert(0);
    set.insert(42);
    set.insert(1023);
    expect(set.has(0)).toBe(true);
    expect(set.has(42)).toBe(true);
    expect(set.has(1023)).toBe(true);
    expect(set.has(1)).toBe(false);
    expect(set.size).toBe(3);
  });

  it('duplicate insert is idempotent', () => {
    set.insert(7);
    set.insert(7);
    expect(set.size).toBe(1);
  });

  it('remove updates size and hierarchy summary bits', () => {
    set.insert(5);
    set.insert(6);
    set.remove(5);
    expect(set.has(5)).toBe(false);
    expect(set.has(6)).toBe(true);
    expect(set.size).toBe(1);

    // Removing last element clears L0/L1 summary bits
    set.remove(6);
    expect(set.size).toBe(0);
    expect(set.l0).toBe(0);
    expect(set.l1Summary[0]).toBe(0);
  });

  it('remove of absent index is a no-op', () => {
    set.insert(1);
    set.remove(999);
    expect(set.size).toBe(1);
  });

  it('works across hierarchy boundaries', () => {
    // Index 32768 starts the next summary group
    set.insert(0);
    set.insert(32768);
    expect(set.has(0)).toBe(true);
    expect(set.has(32768)).toBe(true);
    expect(set.size).toBe(2);
    expect(collect(set)).toEqual([0, 32768]);
  });

  it('forEach yields sorted order', () => {
    const indices = [100, 3, 50, 1023, 0];
    for (const i of indices) set.insert(i);
    const result = collect(set);
    expect(result).toEqual([...indices].sort((a, b) => a - b));
  });

  it('drain yields all items and empties the set', () => {
    set.insert(10);
    set.insert(20);
    set.insert(30);
    const drained: number[] = [];
    set.drain((i) => drained.push(i));
    expect(drained).toEqual([10, 20, 30]);
    expect(set.size).toBe(0);
    expect(set.l0).toBe(0);
  });

  it('clear resets everything', () => {
    for (let i = 0; i < 100; i++) set.insert(i);
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has(0)).toBe(false);
    expect(collect(set)).toEqual([]);
  });

  it('clone produces an independent copy', () => {
    set.insert(1);
    set.insert(2);
    const copy = set.clone();
    set.remove(1);
    expect(copy.has(1)).toBe(true);
    expect(copy.size).toBe(2);
    expect(set.size).toBe(1);
  });

  it('setRange fills a contiguous range', () => {
    set.setRange(10, 42);
    expect(set.size).toBe(32);
    for (let i = 10; i < 42; i++) expect(set.has(i)).toBe(true);
    expect(set.has(9)).toBe(false);
    expect(set.has(42)).toBe(false);
  });

  it('setRange is idempotent with overlapping inserts', () => {
    set.insert(15);
    set.setRange(10, 20);
    expect(set.size).toBe(10);
  });
});

describe('forEachIntersection', () => {
  it('returns elements present in all sets', () => {
    const a = new HiSparseBitSet();
    const b = new HiSparseBitSet();
    for (const i of [1, 2, 3, 4, 5]) a.insert(i);
    for (const i of [3, 4, 5, 6, 7]) b.insert(i);
    expect(collectIntersection([a, b])).toEqual([3, 4, 5]);
  });

  it('returns empty for disjoint sets', () => {
    const a = new HiSparseBitSet();
    const b = new HiSparseBitSet();
    a.insert(0);
    b.insert(1024);
    expect(collectIntersection([a, b])).toEqual([]);
  });

  it('single set returns all its elements', () => {
    const a = new HiSparseBitSet();
    a.insert(10);
    a.insert(20);
    expect(collectIntersection([a])).toEqual([10, 20]);
  });
});

describe('forEachQuery', () => {
  it('required AND NOT forbidden', () => {
    const req = new HiSparseBitSet();
    const forb = new HiSparseBitSet();
    for (let i = 0; i < 10; i++) req.insert(i);
    for (const i of [3, 5, 7]) forb.insert(i);
    expect(collectQuery([req], [forb])).toEqual([0, 1, 2, 4, 6, 8, 9]);
  });

  it('multiple required sets intersect then exclude forbidden', () => {
    const a = new HiSparseBitSet();
    const b = new HiSparseBitSet();
    const f = new HiSparseBitSet();
    for (const i of [1, 2, 3, 4, 5]) a.insert(i);
    for (const i of [2, 3, 4, 5, 6]) b.insert(i);
    f.insert(4);
    expect(collectQuery([a, b], [f])).toEqual([2, 3, 5]);
  });
});

describe('bounded sparse filtering', () => {
  it('prepares leaves once and reports capacity without mutation', () => {
    const set = new HiSparseBitSet(0x400000);
    expect(set.tryInsert(0x3fffff)).toBe(-1);
    set.reserve(0x3ffc00, 0x400000);
    expect(set.tryInsert(0x3fffff)).toBe(1);
    expect(set.tryInsert(0x3fffff)).toBe(0);
    expect(set.tryInsert(0)).toBe(-1);
    for (const invalid of [-1, 0.5, NaN, Infinity, 0x400000, 0x40000000]) {
      expect(set.tryInsert(invalid)).toBe(-2);
      expect(set.insert(invalid)).toBe(false);
      expect(set.has(invalid)).toBe(false);
      expect(set.remove(invalid)).toBe(false);
    }
    expect(collect(set)).toEqual([0x3fffff]);
    set.clear();
    expect(set.tryInsert(0x3fffff)).toBe(1);
    const copy = set.clone();
    set.remove(0x3fffff);
    expect(collect(copy)).toEqual([0x3fffff]);
  });

  it('handles signed words, every hierarchy boundary, and partial capacity', () => {
    const set = new HiSparseBitSet(0x400000);
    const values = [0, 31, 32, 1023, 1024, 32767, 32768, 0xfffff, 0x100000, 0x200000, 0x3fffff];
    for (const value of values) set.insert(value);
    expect(collect(set)).toEqual(values);
    for (const value of values) expect(set.remove(value)).toBe(true);
    expect(set.size).toBe(0);
    expect(collect(set)).toEqual([]);
    const partial = new HiSparseBitSet(33);
    expect(partial.setRange(0, 33)).toBe(33);
    expect(partial.setRange(31, 33)).toBe(0);
    expect(partial.insert(33)).toBe(false);
    expect(() => partial.setRange(32, 34)).toThrow(RangeError);
    expect(partial.size).toBe(33);
    expect(new HiSparseBitSet(0).tryInsert(0)).toBe(-2);
    expect(() => new HiSparseBitSet(NaN)).toThrow(RangeError);
  });

  it('collects a bounded prefix and supports nested intersections', () => {
    const a = new HiSparseBitSet(0x400000);
    const b = new HiSparseBitSet(0x400000);
    const forbidden = new HiSparseBitSet();
    a.setRange(0xffffe, 0x100003);
    b.setRange(0xfffff, 0x100004);
    forbidden.insert(0xfffff);
    const output = new Uint32Array(2);
    expect(collectQueryInto([a, b], [forbidden], output)).toBe(3);
    expect([...output]).toEqual([0x100000, 0x100001]);
    expect(collectQueryInto([a, b], [forbidden], [])).toBe(3);
    expect(collectQueryInto([], [forbidden], output)).toBe(0);
    const nested: number[] = [];
    forEachQuery([a, b], [forbidden], (index) => {
      expect(collectIntersection([a, b])).toHaveLength(4);
      nested.push(index);
    });
    expect(nested).toEqual([0x100000, 0x100001, 0x100002]);
  });

  it('preserves unvisited entries when drain throws', () => {
    const set = new HiSparseBitSet();
    set.setRange(30, 34);
    expect(() =>
      set.drain(() => {
        throw new Error('stop');
      })
    ).toThrow('stop');
    expect(collect(set)).toEqual([31, 32, 33]);
    expect(set.size).toBe(3);
    set.drain(() => {});
    expect(set.size).toBe(0);
    expect(collect(set)).toEqual([]);
  });

  it('matches a reference set through dispersed mutations and ranges', () => {
    const actual = new HiSparseBitSet(0x400000);
    const expected = new Set<number>();
    let state = 12345;
    for (let i = 0; i < 4000; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const index = state & 0x3fffff;
      if (i % 4 === 0) {
        const end = Math.min(index + 33, 0x400000);
        actual.setRange(index, end);
        for (let value = index; value < end; value++) expected.add(value);
      } else if (i % 4 === 1) {
        actual.insert(index);
        expected.add(index);
      } else {
        const removed = i % 8 === 2 ? expected.values().next().value! : index;
        expect(actual.remove(removed)).toBe(expected.delete(removed));
      }
    }
    expect(actual.size).toBe(expected.size);
    expect(collect(actual)).toEqual([...expected].sort((a, b) => a - b));
  });
});
