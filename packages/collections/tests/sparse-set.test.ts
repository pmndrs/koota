import { beforeEach, describe, expect, it } from 'vitest';
import { SparseSet } from '../src';

describe('SparseSet', () => {
  let set: SparseSet;

  beforeEach(() => {
    set = new SparseSet();
  });

  it('should add values correctly', () => {
    // Should add 0 just fine.
    set.add(0);
    expect(set.toArray()).toEqual([0]);
    expect(set.has(0)).toBe(true);

    set.add(1);
    set.add(2);
    expect(set.toArray()).toEqual([0, 1, 2]);
    expect(set.sparse[1]).toBe(1);
    expect(set.sparse[2]).toBe(2);
  });

  it('should not add duplicate values', () => {
    set.add(1);
    set.add(1);
    expect(set.toArray()).toEqual([1]);
  });

  it('should check if a value exists', () => {
    set.add(1);
    expect(set.has(1)).toBe(true);
    expect(set.has(2)).toBe(false);
  });

  it('should remove values correctly', () => {
    set.add(1);
    set.add(2);
    set.remove(1);
    expect(set.toArray()).toEqual([2]);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(true);
  });

  it('should clear the set correctly', () => {
    set.add(1);
    set.add(2);
    set.clear();
    expect(set.length).toBe(0);
    expect(set.toArray()).toEqual([]);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(false);

    set.add(2);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(true);
    expect(set.toArray()).toEqual([2]);
  });

  it('should sort the set correctly', () => {
    set.add(3);
    set.add(1);
    set.add(2);
    set.add(4);
    set.remove(4);
    set.sort();
    expect(set.toArray()).toEqual([1, 2, 3]);
    expect(set.sparse[1]).toBe(0);
    expect(set.sparse[2]).toBe(1);
    expect(set.sparse[3]).toBe(2);
    expect(set.has(4)).toBe(false);
  });

  it.each([0, 1, 128])(
    'keeps colliding values distinct when removing generation %i',
    (generation) => {
      const values = [7, (1 << 24) | 7, (128 << 24) | 7, 8];
      for (const value of values) set.add(value);
      set.add(values[0]);
      expect(set.length).toBe(values.length);

      const removed = (generation << 24) | 7;
      set.remove(removed);
      set.sort();
      expect(set.toArray()).toEqual(
        values.filter((value) => value !== removed).sort((a, b) => a - b)
      );
      expect(set.has(removed)).toBe(false);
      for (const value of set.toArray()) {
        expect(set.has(value)).toBe(true);
        expect(set.dense[set.getIndex(value)]).toBe(value);
      }

      set.clear();
      set.add(removed);
      expect(set.toArray()).toEqual([removed]);
      for (const value of values) expect(set.has(value)).toBe(value === removed);
    }
  );

  it('reads live storage without copying and creates independent array snapshots', () => {
    set.add(1);
    set.add(2);
    const dense = set.dense;
    const snapshot = set.toArray();

    set.remove(1);

    expect(set.dense).toBe(dense);
    expect(dense[0]).toBe(2);
    expect(set.length).toBe(1);
    expect(snapshot).toEqual([1, 2]);
    expect(set.toArray()).toEqual([2]);
  });
});
