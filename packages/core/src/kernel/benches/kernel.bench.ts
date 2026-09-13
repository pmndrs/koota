import { assert, bench, group } from '@pmndrs/labs';
import {
  addTrait,
  addPair,
  collect,
  count,
  createEntity,
  createWorld,
  defineTrait,
  defineRelation,
  destroyWorld,
  entityCount,
  getValue,
  hasTrait,
  observeQuery,
  pair,
  removeTrait,
  removePair,
  resolveQuery,
  setValue,
  type EntityEntry,
  type Query,
  type Term,
  type World,
} from '../index';

const N = 10_000;

function createFixture() {
  const Scalar = defineTrait({ value: 0 });
  const Tag = defineTrait();
  const tags = Array.from({ length: 6 }, () => defineTrait());
  const world = createWorld();
  const entities: number[] = [];
  for (let i = 0; i < N; i++) entities.push(createEntity(world, [[Scalar, { value: i }], Tag]));
  return { world, Scalar, Tag, tags, entities };
}

function cachedQueries(world: World, Scalar: number, Tag: number, tags: number[]): Query[] {
  const queries: Query[] = [];
  for (let i = 0; i < 20; i++) {
    const terms: Term[] = [Tag, Scalar];
    for (let t = 0; t < 6; t++) if ((i >> t) & 1) terms.push(tags[t]);
    queries.push(resolveQuery(world, terms));
  }
  return queries;
}

group('kernel access 10k @kernel-access', () => {
  bench('has trait', function* () {
    const f = createFixture();

    const result = yield () => {
      let total = 0;
      for (let i = 0; i < N; i++) if (hasTrait(f.world, f.entities[i], f.Scalar)) total++;
      return total;
    };

    assert.equal(result, N);
    destroyWorld(f.world);
  });

  bench('write and read fractional scalar', function* () {
    const f = createFixture();

    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        setValue(f.world, f.entities[i], f.Scalar, 'value', i + 0.5);
        sum += getValue(f.world, f.entities[i], f.Scalar, 'value') as number;
      }
      return sum;
    };
    
    assert.equal(result, 50_000_000);
    destroyWorld(f.world);
  });

  bench('copy cached query snapshot', function* () {
    const f = createFixture();
    const query = resolveQuery(f.world, [f.Scalar, f.Tag]);
    const result = yield () => collect(f.world, query).length;
    assert.equal(result, N);
    destroyWorld(f.world);
  });
});

group('kernel structure 10k @kernel-structure', () => {
  bench('remove and reattach tag, no queries', function* () {
    const f = createFixture();
    yield () => {
      for (let i = 0; i < N; i++) {
        removeTrait(f.world, f.entities[i], f.Tag);
        addTrait(f.world, f.entities[i], f.Tag);
      }
    };
    assert.equal(count(f.world, resolveQuery(f.world, [f.Tag])), N);
    destroyWorld(f.world);
  });

  bench('remove and reattach tag, 20 observed queries', function* () {
    const f = createFixture();
    const queries = cachedQueries(f.world, f.Scalar, f.Tag, f.tags);
    for (const query of queries) observeQuery(f.world, query);
    yield () => {
      for (let i = 0; i < N; i++) {
        removeTrait(f.world, f.entities[i], f.Tag);
        addTrait(f.world, f.entities[i], f.Tag);
      }
    };
    assert.equal(count(f.world, queries[0]), N);
    destroyWorld(f.world);
  });

  bench('add and remove shared pair', function* () {
    const f = createFixture();
    const Relation = defineRelation();
    const target = createEntity(f.world);
    yield () => {
      for (let i = 0; i < N; i++) {
        addPair(f.world, f.entities[i], Relation, target);
        removePair(f.world, f.entities[i], Relation, target);
      }
    };
    assert.equal(count(f.world, resolveQuery(f.world, [pair(Relation, target)])), 0);
    destroyWorld(f.world);
  });

  bench('cold population, three scalars', function* () {
    const A = defineTrait({ v: 0 });
    const B = defineTrait({ v: 0 });
    const C = defineTrait({ v: 0 });
    let world: World | null = null;
    const result = yield () => {
      world = createWorld();
      for (let i = 0; i < N; i++) createEntity(world, [[A, { v: i }], [B, { v: i }], [C, { v: i }]]);
      const total = entityCount(world);
      destroyWorld(world);
      return total;
    };
    assert.equal(result, N);
  });

  bench('compile and count 20 cold queries', function* () {
    const cold = Array.from({ length: 6 }, () => defineTrait());
    const S = defineTrait({ v: 0 });
    const result = yield () => {
      const world = createWorld();
      for (let i = 0; i < N; i++) {
        const entries: EntityEntry[] = [S];
        for (let t = 0; t < 6; t++) if (i % (t + 2) === 0) entries.push(cold[t]);
        createEntity(world, entries);
      }
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const terms: Term[] = [S];
        for (let t = 0; t < 6; t++) if ((i >> t) & 1) terms.push(cold[t]);
        total += count(world, resolveQuery(world, terms));
      }
      destroyWorld(world);
      return total;
    };
    assert.equal((result as number) > 0, true);
  });
});
