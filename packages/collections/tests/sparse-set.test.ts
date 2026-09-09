import { beforeEach, describe, expect, it } from 'vitest';
import {
  addSparse,
  clearSparse,
  createSparseSet,
  hasSparse,
  removeSparse,
  sortSparse,
  type SparseSet,
} from '../src';

describe('SparseSet', () => {
  let set: SparseSet;

  beforeEach(() => {
    set = createSparseSet();
  });

  it('should add values correctly', () => {
    // Should add 0 just fine.
    addSparse(set, 0);
    expect(set.dense).toEqual([0]);
    expect(hasSparse(set, 0)).toBe(true);

    addSparse(set, 1);
    addSparse(set, 2);
    expect(set.dense).toEqual([0, 1, 2]);
    expect(set.sparse[1]).toBe(1);
    expect(set.sparse[2]).toBe(2);
  });

  it('should not add duplicate values', () => {
    addSparse(set, 1);
    addSparse(set, 1);
    expect(set.dense).toEqual([1]);
  });

  it('should check if a value exists', () => {
    addSparse(set, 1);
    expect(hasSparse(set, 1)).toBe(true);
    expect(hasSparse(set, 2)).toBe(false);
  });

  it('should remove values correctly', () => {
    addSparse(set, 1);
    addSparse(set, 2);
    removeSparse(set, 1);
    expect(set.dense).toEqual([2]);
    expect(hasSparse(set, 1)).toBe(false);
    expect(hasSparse(set, 2)).toBe(true);
  });

  it('should clear the set correctly', () => {
    addSparse(set, 1);
    addSparse(set, 2);
    clearSparse(set);
    expect(set.dense).toEqual([]);
    expect(hasSparse(set, 1)).toBe(false);
    expect(hasSparse(set, 2)).toBe(false);
  });

  it('should reuse a cleared set without leaking stale membership', () => {
    addSparse(set, 5);
    clearSparse(set);
    addSparse(set, 7);
    expect(set.dense).toEqual([7]);
    expect(hasSparse(set, 5)).toBe(false);
    expect(hasSparse(set, 7)).toBe(true);
  });

  it('should sort the set correctly', () => {
    addSparse(set, 3);
    addSparse(set, 1);
    addSparse(set, 2);
    sortSparse(set);
    expect(set.dense).toEqual([1, 2, 3]);
    expect(set.sparse[1]).toBe(0);
    expect(set.sparse[2]).toBe(1);
    expect(set.sparse[3]).toBe(2);
  });

  it('should expose dense as a live field, not a copy', () => {
    addSparse(set, 1);
    expect(set.dense).toBe(set.dense);
  });
});
