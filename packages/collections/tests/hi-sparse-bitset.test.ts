import { beforeEach, describe, expect, it } from 'vitest';
import { HiSparseBitSet, collectIntersection, collectQuery, ctz32 } from '../src';

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

    it('works across L0 boundaries (high indices)', () => {
        // Index 32768 = first bit in L0 group 1
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
