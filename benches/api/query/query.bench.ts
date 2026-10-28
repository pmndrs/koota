import { assert, bench, group } from '@pmndrs/labs';
import { createChanged, createQuery, createWorld, type Entity, Not, relation, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Health = trait({ hp: 100 });
const IsActive = trait();
const IsStatic = trait();
const HasPhysics = trait();
const HasRender = trait();
const HasAI = trait();
const HasCollider = trait();

group('query selectivity 50k @query', () => {
  bench('1 trait, 100% match', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) world.spawn(Velocity);

    const result = yield () => world.query(Velocity);

    world.destroy();
    return result.length;
  });
  bench('1 trait, ~1% match', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) {
      if (i % 100 === 0) {
        world.spawn(Velocity);
      } else world.spawn();
    }

    const result = yield () => world.query(Velocity);

    world.destroy();
    return result.length;
  });
  bench('1 trait, ~0.1% match', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) {
      if (i % 1000 === 0) {
        world.spawn(Velocity);
      } else world.spawn();
    }

    const result = yield () => world.query(Velocity);

    world.destroy();
    return result.length;
  });
});

group('n-way intersection 100k @query', () => {
  const buildNWay = () => {
    const world = createWorld();
    for (let i = 0; i < 100_000; i++) {
      const traits: any[] = [Position];
      if (i % 2 === 0) traits.push(Velocity);
      if (i % 3 === 0) traits.push(Health);
      if (i % 5 === 0) traits.push(HasRender);
      if (i % 7 === 0) traits.push(HasPhysics);
      if (i % 11 === 0) traits.push(HasAI);
      if (i % 13 === 0) traits.push(HasCollider);
      world.spawn(...traits);
    }
    return world;
  };

  bench('1 trait, 100% match', function* () {
    const world = buildNWay();
    const result = yield () => world.query(Position);
    world.destroy();
    return result.length;
  });

  bench('2 traits, 50% match', function* () {
    const world = buildNWay();
    const result = yield () => world.query(Position, Velocity);
    world.destroy();
    return result.length;
  });

  bench('3 traits, ~16% match)', function* () {
    const world = buildNWay();
    const result = yield () => world.query(Position, Velocity, Health);
    world.destroy();
    return result.length;
  });

  bench('4 traits, ~3.3% match)', function* () {
    const world = buildNWay();
    const result = yield () => world.query(Position, Velocity, Health, HasRender);
    world.destroy();
    return result.length;
  });

  bench('5 traits, ~0.476% match)', function* () {
    const world = buildNWay();
    const result = yield () => world.query(Position, Velocity, Health, HasRender, HasPhysics);
    world.destroy();
    return result.length;
  });

  bench('6 traits, ~0.043% match', function* () {
    const world = buildNWay();
    const result = yield () => world.query(Position, Velocity, Health, HasRender, HasPhysics, HasAI);
    world.destroy();
    return result.length;
  });

  bench('7 traits, ~0.003% match', function* () {
    const world = buildNWay();
    const result = yield () =>
      world.query(Position, Velocity, Health, HasRender, HasPhysics, HasAI, HasCollider);
    world.destroy();
    return result.length;
  });
});

group('not exclusion 50k @query', () => {
  bench('2 traits, 1% entities excluded', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) {
      if (i % 100 === 0) {
        world.spawn(Position, IsStatic);
      } else world.spawn(Position);
    }

    const result = yield () => world.query(Position, Not(IsStatic));

    world.destroy();
    return result.length;
  });

  bench('2 traits, 50% entities excluded', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) {
      if (i % 2 === 0) {
        world.spawn(Position, IsStatic);
      } else world.spawn(Position);
    }

    const result = yield () => world.query(Position, Not(IsStatic));

    world.destroy();
    return result.length;
  });
});

group('query throughput 50k @query', () => {
  bench('3 traits, query 2 - 50% match', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) {
      const traits: any[] = [Position];
      if (i % 2 === 0) traits.push(Velocity);
      if (i % 5 === 0) traits.push(Health);
      world.spawn(...traits);
    }
    world.query(Position, Velocity);

    const result = yield () => world.query(Position, Velocity);

    world.destroy();
    return result.length;
  });

  bench('3 traits, query 3 - 10% match', function* () {
    const world = createWorld();
    for (let i = 0; i < 50_000; i++) {
      const traits: any[] = [Position];
      if (i % 2 === 0) traits.push(Velocity);
      if (i % 5 === 0) traits.push(Health);
      world.spawn(...traits);
    }
    world.query(Position, Velocity, Health);

    const result = yield () => world.query(Position, Velocity, Health);

    world.destroy();
    return result.length;
  });
});

for (const count of [1, 10_000]) {
  group(`queryFirst ${count} matches @query @query-first`, () => {
    for (const mode of ['inline', 'cached', 'relation'] as const) {
      bench(mode, function* () {
        const world = createWorld();
        const Position = trait({ x: 0 });
        const ChildOf = relation();
        const parent = world.spawn();
        const entities: Entity[] = [];
        for (let i = 0; i < count; i++) {
          entities.push(world.spawn(Position, ChildOf(parent)));
        }
        const query = createQuery(Position);
        const first =
          mode === 'cached'
            ? () => world.queryFirst(query)
            : mode === 'relation'
              ? () => world.queryFirst(ChildOf(parent))
              : () => world.queryFirst(Position);
        let result = first();
        assert.equal(result, entities[0]);

        yield {
          bench: () => (result = first()),
          snapshot: () => {
            assert.equal(result, entities[0]);
            return result;
          },
        };

        world.destroy();
      });
    }
  });
}

group('queryFirst tracking @query @query-first', () => {
  bench('change and consume 10k matches', function* () {
    const world = createWorld();
    const Position = trait({ x: 0 });
    const Changed = createChanged();
    const query = createQuery(Changed(Position));
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) entities.push(world.spawn(Position));
    let result = world.queryFirst(query);
    assert.equal(result, undefined);

    yield {
      bench: () => {
        for (const entity of entities) entity.changed(Position);
        return (result = world.queryFirst(query));
      },
      snapshot: () => {
        assert.equal(result, entities[0]);
        assert.equal(world.queryFirst(query), undefined);
        return result;
      },
    };

    world.destroy();
  });
});

group('query maintenance 10k @query @maintenance', () => {
  const buildWithQueries = () => {
    const world = createWorld();
    const traitSubsets = [
      [Position],
      [Velocity],
      [Health],
      [Position, Velocity],
      [Position, Health],
      [Velocity, Health],
      [Position, Velocity, Health],
      [Position, IsActive],
      [Velocity, IsActive],
      [Health, IsActive],
      [HasRender],
      [HasPhysics],
      [HasRender, HasPhysics],
      [Position, HasRender],
      [Position, HasPhysics],
      [Velocity, HasRender],
      [Velocity, HasPhysics],
      [Position, Velocity, HasRender],
      [Position, Velocity, HasPhysics],
      [Position, Velocity, Health, HasRender],
    ];
    for (const subset of traitSubsets) world.query(...subset);
    return world;
  };

  bench('spawn when 20 queries active', function* () {
    const world = buildWithQueries();
    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) {
          world.spawn(Position, Velocity, Health);
        }
      },
      snapshot: () => world.query(Position, Velocity, Health).length,
      after: () => {
        for (const entity of world.query(Position)) entity.destroy();
        // Commit removals while the world is empty.
        world.query(Position);
      },
    };
    world.destroy();
  });

  bench('add trait when 20 queries active', function* () {
    const world = buildWithQueries();
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position, Velocity));
    }

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].add(HasRender);
        }
      },
      snapshot: () => world.query(Position, HasRender).length,
      after: () => {
        for (const entity of entities) entity.remove(HasRender);
        // Commit removals before the next add.
        world.query(HasRender);
      },
    };

    world.destroy();
  });

  bench('remove trait when 20 queries active', function* () {
    const world = buildWithQueries();
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position, Velocity, Health, HasRender));
    }

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].remove(Velocity);
        }
      },
      snapshot: () => world.query(Position, Velocity).length,
      after: () => {
        // Commit removals before restoring Velocity.
        world.query(Velocity);
        for (const entity of entities) entity.add(Velocity);
      },
    };

    world.destroy();
  });
});
