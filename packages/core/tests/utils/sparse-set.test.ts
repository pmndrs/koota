import { describe, beforeEach, it, expect } from 'vitest';
import { SparseSet } from '../../src/utils/sparse-set';

describe('SparseSet', () => {
	let set: SparseSet;

	beforeEach(() => {
		set = new SparseSet();
	});

	it('should add values correctly', () => {
		// Should add 0 just fine.
		set.add(0);
		expect(set.dense).toEqual([0]);
		expect(set.has(0)).toBe(true);

		set.add(1);
		set.add(2);
		expect(set.dense).toEqual([0, 1, 2]);
		expect(set.sparse[1]).toBe(1);
		expect(set.sparse[2]).toBe(2);
	});

	it('should not add duplicate values', () => {
		set.add(1);
		set.add(1);
		expect(set.dense).toEqual([1]);
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
		expect(set.dense).toEqual([2]);
		expect(set.has(1)).toBe(false);
		expect(set.has(2)).toBe(true);
	});

	it('should clear the set correctly', () => {
		set.add(1);
		set.add(2);
		set.clear();
		expect(set.dense).toEqual([]);
	});

	it('should sort the set correctly', () => {
		set.add(3);
		set.add(1);
		set.add(2);
		set.sort();
		expect(set.dense).toEqual([1, 2, 3]);
		expect(set.sparse[1]).toBe(0);
		expect(set.sparse[2]).toBe(1);
		expect(set.sparse[3]).toBe(2);
	});
});
