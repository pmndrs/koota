import { assert, bench, group } from '@pmndrs/labs';
import { HiSparseBitSet, forEachIntersection, forEachQuery } from '../src';

// --- Constants ---
// All benchmarks use 10k elements so per-element cost is directly comparable.

const N = 10_000;
type Regime = { name: string; stride: number };
const REGIMES: Regime[] = [
  { name: 'packed', stride: 1 },
  { name: 'dispersed', stride: 10 },
  // Keep even the disjoint sets within the bitset's 2^20 index capacity.
  { name: 'extreme', stride: 50 },
];

function filledSet(n: number, stride: number): HiSparseBitSet {
  const s = new HiSparseBitSet();
  for (let i = 0; i < n * stride; i += stride) s.insert(i);
  return s;
}

// --- insert 10k ---

group('insert 10k @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      let set: HiSparseBitSet;
      const limit = N * stride;
      yield {
        0: () => (set = new HiSparseBitSet()),
        bench: (set: HiSparseBitSet) => {
          for (let i = 0; i < limit; i += stride) set.insert(i);
        },
        snapshot: () => set.size,
      };
    });
  }
});

// --- has 10k ---

group('has 10k (hit) @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const set = filledSet(N, stride);
      const limit = N * stride;
      const result = yield () => {
        let hits = 0;
        for (let i = 0; i < limit; i += stride) {
          if (set.has(i)) hits++;
        }
        return hits;
      };
      assert.equal(result, N);
      return result;
    });
  }
});

group('has 10k (miss) @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const set = filledSet(N, stride);
      const limit = N * stride;
      // Packed misses follow the populated range, sparse misses fall in the gaps.
      const offset = stride === 1 ? N : 1;
      const result = yield () => {
        let hits = 0;
        for (let i = offset; i < limit + offset; i += stride) {
          if (set.has(i)) hits++;
        }
        return hits;
      };
      assert.equal(result, 0);
      return result;
    });
  }
});

// --- remove 10k ---

group('remove 10k @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      let set: HiSparseBitSet;
      const limit = N * stride;
      yield {
        0: () => (set = filledSet(N, stride)),
        bench: (set: HiSparseBitSet) => {
          for (let i = 0; i < limit; i += stride) set.remove(i);
        },
        snapshot: () => set.size,
      };
    });
  }
});

// --- forEach 10k ---

group('forEach 10k @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const set = filledSet(N, stride);
      const result = yield () => {
        let sum = 0;
        set.forEach((index) => {
          sum += index;
        });
        return sum;
      };
      return result;
    });
  }
});

// --- drain 10k ---

group('drain 10k @bitset @drain', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      let set: HiSparseBitSet;
      let checksum = 0;
      yield {
        0: () => (set = filledSet(N, stride)),
        bench: (set: HiSparseBitSet) => {
          checksum = 0;
          set.drain((index) => {
            checksum += index;
          });
          return checksum;
        },
        snapshot: () => [set.size, checksum],
      };
    });
  }
});

// --- setRange vs insert (packed only) ---

group('setRange vs insert 10k @bitset', () => {
  bench('setRange', function* () {
    let set: HiSparseBitSet;
    yield {
      0: () => (set = new HiSparseBitSet()),
      bench: (set: HiSparseBitSet) => {
        set.setRange(0, N);
      },
      snapshot: () => set.size,
    };
  });

  bench('insert loop', function* () {
    let set: HiSparseBitSet;
    yield {
      0: () => (set = new HiSparseBitSet()),
      bench: (set: HiSparseBitSet) => {
        for (let i = 0; i < N; i++) set.insert(i);
      },
      snapshot: () => set.size,
    };
  });
});

// --- forEachIntersection ---
// 2-way intersection, ~10k result elements, varying sparseness of inputs.

group('intersection 2-way 10k result @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const a = filledSet(N, stride);
      const b = filledSet(N, stride);
      return yield () => forEachIntersection([a, b], () => {});
    });
  }
});

// 4-way intersection, same sparseness regimes.
// Sets overlap on multiples of stride*1, stride*2, stride*3, stride*5.
// Intersection = multiples of lcm pattern → tests hierarchy pruning.

group('intersection 4-way @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const a = filledSet(N, stride);
      const b = filledSet(Math.ceil(N / 2), stride * 2);
      const c = filledSet(Math.ceil(N / 3), stride * 3);
      const d = filledSet(Math.ceil(N / 5), stride * 5);
      return yield () => forEachIntersection([a, b, c, d], () => {});
    });
  }
});

// Disjoint: best-case early exit at word level.

group('intersection 2-way disjoint @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const a = filledSet(N, stride * 2);
      const b = new HiSparseBitSet();
      const limit = N * stride * 2;
      for (let i = stride; i < limit; i += stride * 2) b.insert(i);
      return yield () => forEachIntersection([a, b], () => {});
    });
  }
});

// --- forEachQuery (required + forbidden) ---
// 1 required set, 1 forbidden set that excludes ~10% of results.

group('query req+forb 10k, 10% excluded @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const req = filledSet(N, stride);
      // Forbidden hits every 10th element of req
      const forb = filledSet(Math.ceil(N / 10), stride * 10);
      return yield () => forEachQuery([req], [forb], () => {});
    });
  }
});

group('query 2 req + 1 forb @bitset', () => {
  for (const { name, stride } of REGIMES) {
    bench(name, function* () {
      const a = filledSet(N, stride);
      const b = filledSet(Math.ceil(N / 2), stride * 2);
      const forb = filledSet(Math.ceil(N / 10), stride * 10);
      return yield () => forEachQuery([a, b], [forb], () => {});
    });
  }
});
