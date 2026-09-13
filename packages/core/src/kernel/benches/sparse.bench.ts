import { assert, bench, group } from '@pmndrs/labs';
import {
  addTrait,
  collect,
  createEntity,
  createWorld,
  defineTrait,
  destroyWorld,
  getValue,
  observeQuery,
  removeTrait,
  resolveQuery,
  setValue,
  type Query,
  type Term,
  type World,
} from '../index';

const N = 10_000;

/** Position plus six spread tags, so the world holds several archetypes. */
function createFixture(sparse: boolean) {
  const Position = defineTrait({ x: 0, y: 0 });
  const tags = Array.from({ length: 6 }, () => defineTrait());
  const Flag = defineTrait(undefined, sparse ? { sparse: true } : undefined);
  const Data = defineTrait({ value: 0 }, sparse ? { sparse: true } : undefined);
  const world = createWorld();
  const entities: number[] = [];
  for (let i = 0; i < N; i++) {
    const entries: (number | [number, unknown])[] = [[Position, { x: i, y: i }]];
    for (let b = 0; b < 3; b++) if (i & (1 << b)) entries.push(tags[b]);
    entities.push(createEntity(world, entries));
  }
  return { world, Position, tags, Flag, Data, entities };
}

function observedQueries(world: World, Flag: number, Position: number, tags: number[]): Query[] {
  const queries: Query[] = [];
  for (let i = 0; i < 20; i++) {
    const terms: Term[] = [Flag, Position];
    for (let t = 0; t < 6; t++) if ((i >> t) & 1) terms.push(tags[t]);
    const query = resolveQuery(world, terms);
    observeQuery(world, query);
    queries.push(query);
  }
  return queries;
}

for (const sparse of [false, true]) {
  const kind = sparse ? 'sparse' : 'archetype';
  group(`${kind} trait churn 10k @kernel-sparse`, () => {
    bench(`${kind} tag add and remove, no queries`, function* () {
      const f = createFixture(sparse);
      const result = yield () => {
        let total = 0;
        for (let i = 0; i < N; i++) {
          if (addTrait(f.world, f.entities[i], f.Flag)) total++;
          if (removeTrait(f.world, f.entities[i], f.Flag)) total++;
        }
        return total;
      };
      assert.equal(result, 2 * N);
      destroyWorld(f.world);
    });

    bench(`${kind} tag add and remove, 20 observed queries`, function* () {
      const f = createFixture(sparse);
      const queries = observedQueries(f.world, f.Flag, f.Position, f.tags);
      const result = yield () => {
        let total = 0;
        for (let i = 0; i < N; i++) {
          if (addTrait(f.world, f.entities[i], f.Flag)) total++;
          if (removeTrait(f.world, f.entities[i], f.Flag)) total++;
        }
        return total + queries.length;
      };
      assert.equal(result, 2 * N + 20);
      destroyWorld(f.world);
    });

    bench(`${kind} data trait set and get`, function* () {
      const f = createFixture(sparse);
      for (let i = 0; i < N; i++) addTrait(f.world, f.entities[i], f.Data, { value: i });
      const result = yield () => {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          setValue(f.world, f.entities[i], f.Data, 'value', i + 0.5);
          sum += getValue(f.world, f.entities[i], f.Data, 'value') as number;
        }
        return sum;
      };
      assert.equal(result, 50_000_000);
      destroyWorld(f.world);
    });

    for (const percent of [1, 50]) {
      bench(`${kind} collect [Position, Flag], ${percent}% hold the flag`, function* () {
        const f = createFixture(sparse);
        const holders = Math.floor((N * percent) / 100);
        for (let i = 0; i < holders; i++) addTrait(f.world, f.entities[(i * 7919) % N], f.Flag);
        const query = resolveQuery(f.world, [f.Position, f.Flag]);
        const result = yield () => collect(f.world, query).length;
        assert.equal(result, holders);
        destroyWorld(f.world);
      });
    }
  });
}
