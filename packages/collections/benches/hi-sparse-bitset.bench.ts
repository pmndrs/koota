import { bench, group } from '@pmndrs/labs';
import { HiSparseBitSet, forEachIntersection, forEachQuery } from '../src';

// --- Constants ---
// All benchmarks use 10k elements so per-element cost is directly comparable.

const N = 10_000;
const PACKED = 1; // contiguous: ~312 bits/block, near-full
const DISPERSED = 10; // moderate: ~31 bits/block, realistic ECS pattern
const EXTREME = 1000; // pathological: ~1 bit/block

type Regime = { name: string; stride: number };
const REGIMES: Regime[] = [
	{ name: 'packed', stride: PACKED },
	{ name: 'dispersed', stride: DISPERSED },
	{ name: 'extreme', stride: EXTREME },
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
			const set = new HiSparseBitSet();
			const limit = N * stride;
			yield {
				bench: () => {
					for (let i = 0; i < limit; i += stride) set.insert(i);
				},
				after: () => set.clear(),
			};
		}).gc('inner');
	}
});

// --- has 10k ---

group('has 10k (hit) @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const set = filledSet(N, stride);
			const limit = N * stride;
			yield () => {
				for (let i = 0; i < limit; i += stride) set.has(i);
			};
		}).gc('inner');
	}
});

group('has 10k (miss) @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const set = filledSet(N, stride);
			const limit = N * stride;
			// Offset by 1 so every lookup misses
			yield () => {
				for (let i = 1; i < limit; i += stride) set.has(i);
			};
		}).gc('inner');
	}
});

// --- remove 10k ---

group('remove 10k @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			let set = filledSet(N, stride);
			const limit = N * stride;
			yield {
				bench: () => {
					for (let i = 0; i < limit; i += stride) set.remove(i);
				},
				after: () => {
					set = filledSet(N, stride);
				},
			};
		}).gc('inner');
	}
});

// --- forEach 10k ---

group('forEach 10k @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const set = filledSet(N, stride);
			yield () => {
				set.forEach(() => {});
			};
		}).gc('inner');
	}
});

// --- drain 10k ---

group('drain 10k @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			let set = filledSet(N, stride);
			yield {
				bench: () => {
					set.drain(() => {});
				},
				after: () => {
					set = filledSet(N, stride);
				},
			};
		}).gc('inner');
	}
});

// --- setRange vs insert (packed only) ---

group('setRange vs insert 10k @bitset', () => {
	bench('setRange', function* () {
		const set = new HiSparseBitSet();
		yield {
			bench: () => {
				set.setRange(0, N);
			},
			after: () => set.clear(),
		};
	}).gc('inner');

	bench('insert loop', function* () {
		const set = new HiSparseBitSet();
		yield {
			bench: () => {
				for (let i = 0; i < N; i++) set.insert(i);
			},
			after: () => set.clear(),
		};
	}).gc('inner');
});

// --- forEachIntersection ---
// 2-way intersection, ~10k result elements, varying sparseness of inputs.

group('intersection 2-way 10k result @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const a = filledSet(N, stride);
			const b = filledSet(N, stride);
			yield () => {
				forEachIntersection([a, b], () => {});
			};
		}).gc('inner');
	}
});

// 4-way intersection, same sparseness regimes.
// Sets overlap on multiples of stride*1, stride*2, stride*3, stride*5.
// Intersection = multiples of lcm pattern → tests hierarchy pruning.

group('intersection 4-way @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const a = filledSet(N, stride);
			const b = filledSet(N * 2, stride * 2);
			const c = filledSet(N * 3, stride * 3);
			const d = filledSet(N * 5, stride * 5);
			yield () => {
				forEachIntersection([a, b, c, d], () => {});
			};
		}).gc('inner');
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
			yield () => {
				forEachIntersection([a, b], () => {});
			};
		}).gc('inner');
	}
});

// --- forEachQuery (required + forbidden) ---
// 1 required set, 1 forbidden set that excludes ~10% of results.

group('query req+forb 10k, 10% excluded @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const req = filledSet(N, stride);
			// Forbidden hits every 10th element of req
			const forb = filledSet(N, stride * 10);
			yield () => {
				forEachQuery([req], [forb], () => {});
			};
		}).gc('inner');
	}
});

group('query 2 req + 1 forb @bitset', () => {
	for (const { name, stride } of REGIMES) {
		bench(name, function* () {
			const a = filledSet(N, stride);
			const b = filledSet(N * 2, stride * 2);
			const forb = filledSet(N, stride * 10);
			yield () => {
				forEachQuery([a, b], [forb], () => {});
			};
		}).gc('inner');
	}
});
