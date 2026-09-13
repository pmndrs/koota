import { assert, bench, group } from '@pmndrs/labs';
import { createChanged, createQuery, createWorld, relation, trait, type Entity, type Trait, type World } from '../../index';

const N = 10_000;

function createFixture() {
  const Position = trait({ x: 0, y: 0 });
  const Velocity = trait({ x: 1, y: 1 });
  const Tag = trait();
  const tags = Array.from({ length: 6 }, () => trait());
  const world = createWorld();
  const entities: Entity[] = [];
  for (let i = 0; i < N; i++) entities.push(world.spawn(Position({ x: i }), Velocity, Tag));
  return { world, Position, Velocity, Tag, tags, entities };
}

function cacheQueries(world: World, Position: Trait, Tag: Trait, tags: Trait[]) {
  const keys = Array.from({ length: 20 }, (_, i) => {
    const params: Trait[] = [Tag, Position];
    for (let t = 0; t < 6; t++) if ((i >> t) & 1) params.push(tags[t]);
    return createQuery(...params);
  });
  for (const key of keys) world.query(key);
  return keys;
}

group('public API access 10k @api-access', () => {
  bench('entity.has', function* () {
    const f = createFixture();
    const result = yield () => {
      let total = 0;
      for (let i = 0; i < N; i++) if (f.entities[i].has(f.Position)) total++;
      return total;
    };
    assert.equal(result, N);
    f.world.destroy();
  });

  bench('entity.get and entity.set', function* () {
    const f = createFixture();
    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        f.entities[i].set(f.Position, { x: i + 0.5 });
        sum += f.entities[i].get(f.Position)!.x;
      }
      return sum;
    };
    assert.equal(result, 50_000_000);
    f.world.destroy();
  });

  bench('updateEach move, no listeners', function* () {
    const f = createFixture();
    const moving = createQuery(f.Position, f.Velocity);
    yield () => {
      f.world.query(moving).updateEach(([p, v]) => {
        p.x += v.x;
        p.y += v.y;
      });
    };
    assert.equal(f.world.query(moving).length, N);
    f.world.destroy();
  });

  bench('updateEach move, change listener', function* () {
    const f = createFixture();
    const moving = createQuery(f.Position, f.Velocity);
    const Changed = createChanged();
    f.world.onChange(f.Position, () => {});
    const result = yield () => {
      f.world.query(moving).updateEach(([p, v]) => {
        p.x += v.x;
        p.y += v.y;
      });
      return f.world.query(Changed(f.Position)).length;
    };
    assert.equal(result, N);
    f.world.destroy();
  });

  bench('getPages column loop', function* () {
    const f = createFixture();
    const moving = createQuery(f.Position, f.Velocity);
    const result = yield () => {
      let total = 0;
      for (const page of f.world.query(moving).getPages()) {
        const [p, v] = page.stores;
        for (let i = 0; i < page.indices.length; i++) total += p.x[page.indices[i]] + v.x[page.indices[i]];
      }
      return total;
    };
    assert.equal((result as number) > 0, true);
    f.world.destroy();
  });
});

group('public API structure 10k @api-structure', () => {
  bench('remove and add tag, 20 cached queries', function* () {
    const f = createFixture();
    const keys = cacheQueries(f.world, f.Position, f.Tag, f.tags);
    yield () => {
      for (let i = 0; i < N; i++) {
        f.entities[i].remove(f.Tag);
        f.entities[i].add(f.Tag);
      }
    };
    assert.equal(f.world.query(keys[0]).length, N);
    f.world.destroy();
  });

  bench('add and remove shared pair', function* () {
    const f = createFixture();
    const ChildOf = relation();
    const parent = f.world.spawn();
    yield () => {
      for (let i = 0; i < N; i++) {
        f.entities[i].add(ChildOf(parent));
        f.entities[i].remove(ChildOf(parent));
      }
    };
    assert.equal(f.world.query(ChildOf(parent)).length, 0);
    f.world.destroy();
  });

  bench('spawn three traits and destroy', function* () {
    const f = createFixture();
    yield () => {
      const spawned: Entity[] = [];
      for (let i = 0; i < N; i++) spawned.push(f.world.spawn(f.Position({ x: i }), f.Velocity, f.Tag));
      for (let i = 0; i < N; i++) spawned[i].destroy();
    };
    assert.equal(f.world.entities.length, N + 1);
    f.world.destroy();
  });
});
