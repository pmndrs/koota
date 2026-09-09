import { assert, bench, group } from '@pmndrs/labs';
import {
  HiSparseBitSet,
  forEachQuery,
  collectQueryInto,
} from '../../packages/collections/src/hi-sparse-bitset';
import {
  addSparse,
  createSparseSet,
  hasSparse,
} from '../../packages/core/src/kernel/entity/entity-set';

function fixture(size: number, stride: number, disjoint: boolean) {
  const required = [
    new HiSparseBitSet(size * stride > 0x100000 ? 0x400000 : 0x100000),
    new HiSparseBitSet(size * stride > 0x100000 ? 0x400000 : 0x100000),
  ];
  const forbidden = [new HiSparseBitSet(size * stride > 0x100000 ? 0x400000 : 0x100000)];
  const candidates = createSparseSet(size);
  const second = createSparseSet(size);
  const excluded = createSparseSet(size);
  const cached = createSparseSet(size);
  for (let i = 0; i < size; i++) {
    const entity = i * stride;
    required[0].insert(entity);
    addSparse(candidates, entity);
    if (disjoint || i % 3 === 0) {
      const match = disjoint ? entity + 524_288 : entity;
      required[1].insert(match);
      addSparse(second, match);
    }
    if (i % 10 === 0) {
      forbidden[0].insert(entity);
      addSparse(excluded, entity);
    }
    if (!disjoint && i % 3 === 0 && i % 10 !== 0) addSparse(cached, entity);
  }
  return { required, forbidden, candidates, second, excluded, cached, output: new Uint32Array(size) };
}

// Index construction and cache maintenance are excluded. This compares prepared filtering only.
for (const [name, size, stride, disjoint] of [
  ['dense 100k', 100_000, 1, false],
  ['sparse 10k across 1m slots', 10_000, 100, false],
  ['disjoint page ranges 10k', 10_000, 1, true],
  ['sparse 10k across 4m slots', 10_000, 400, false],
] as const) {
  group(`${name} @kernel-sparse`, () => {
    for (const method of [
      'hierarchical bitset',
      'bounded bitset output',
      'candidate hash probes',
      'cached result copy',
    ]) {
      bench(method, function* () {
        const f = fixture(size, stride, disjoint);
        let count = 0;
        const collect = (entity: number) => {
          f.output[count++] = entity;
        };
        const result = yield () => {
          count = 0;
          if (method === 'hierarchical bitset') {
            forEachQuery(f.required, f.forbidden, collect);
          } else if (method === 'bounded bitset output') {
            count = collectQueryInto(f.required, f.forbidden, f.output);
          } else if (method === 'candidate hash probes') {
            const candidates = f.second.size < f.candidates.size ? f.second : f.candidates;
            const other = candidates === f.second ? f.candidates : f.second;
            for (let i = 0; i < candidates.size; i++) {
              const entity = candidates.dense[i];
              if (hasSparse(other, entity) && !hasSparse(f.excluded, entity))
                f.output[count++] = entity;
            }
          } else {
            count = f.cached.size;
            for (let i = 0; i < count; i++) f.output[i] = f.cached.dense[i];
          }
          return count;
        };
        assert.equal(result, f.cached.size);
        for (let i = 0; i < f.cached.size; i++) assert.equal(f.output[i], f.cached.dense[i]);
        return result;
      });
    }
  });
}

group('prepared sparse membership @kernel-sparse', () => {
  bench('remove and bounded insert 10k across 4m slots', function* () {
    const set = new HiSparseBitSet(0x400000);
    for (let i = 0; i < 10_000; i++) {
      set.reserve(i * 400, i * 400 + 1);
      set.tryInsert(i * 400);
    }
    const result = yield () => {
      let count = 0;
      for (let i = 0; i < 10_000; i++) {
        set.remove(i * 400);
        count += set.tryInsert(i * 400);
      }
      return count;
    };
    assert.equal(result, 10_000);
    assert.equal(set.size, 10_000);
    return result;
  });
});
