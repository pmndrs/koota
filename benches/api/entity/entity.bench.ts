import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });

group('entity mutations 10k @entity @mutation', () => {
  for (const queries of [0, 1]) {
    bench(`entity.add + remove, ${queries} queries`, function* () {
      const Tag = trait();
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn());
      const refs = Array.from({ length: queries }, (_, i) =>
        createQuery(Tag, ...(i % 2 ? [Position] : []))
      );
      for (const ref of refs) world.query(ref);

      yield {
        bench: () => {
          for (let i = 0; i < entities.length; i++) {
            entities[i].add(Tag);
            entities[i].remove(Tag);
          }
        },
        snapshot: () => {
          assert.equal(entities[9999].has(Tag), false);
          for (const ref of refs) assert.equal(world.query(ref).length, 0);
          return entities.length;
        },
      };

      world.destroy();
    });
  }

  bench('entity.add + remove 4 traits, 1 query', function* () {
    const traits = Array.from({ length: 4 }, () => trait({ value: 0 }));
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn());
    world.query(...traits);

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].add(...traits);
          entities[i].remove(...traits);
        }
      },
      snapshot: () => {
        assert.equal(world.query(...traits).length, 0);
        return entities.length;
      },
    };

    world.destroy();
  });
});

group('spawn throughput 10k @entity @lifecycle @spawn', () => {
  bench('spawn with no traits', function* () {
    const world = createWorld();

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) {
          world.spawn();
        }
      },
      snapshot: () => world.entities.length,
      after: () => world.reset(),
    };

    world.destroy();
  });

  bench('spawn with 1 trait', function* () {
    const world = createWorld();

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) {
          world.spawn(Position);
        }
      },
      snapshot: () => world.query(Position).length,
      after: () => world.reset(),
    };

    world.destroy();
  });

  bench('spawn with 8 traits', function* () {
    const world = createWorld();
    const traits = Array.from({ length: 8 }, () => trait({ value: 0 }));

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.spawn(...traits);
      },
      snapshot: () => world.query(...traits).length,
      after: () => world.reset(),
    };

    world.destroy();
  });
});

group('entity.has dispatch 10k @entity @has', () => {
  bench('entity.has', function* () {
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position));
    }

    const result = yield () => {
      let matches = 0;
      for (let i = 0; i < entities.length; i++) {
        if (entities[i].has(Position)) matches++;
      }
      return matches;
    };

    world.destroy();
    return result;
  });
});

group('entity.destroy 10k @entity @lifecycle', () => {
  bench('destroy entities', function* () {
    const world = createWorld();
    const entities: Entity[] = [];
    const spawn = () => {
      for (let i = 0; i < 10_000; i++) entities[i] = world.spawn(Position);
    };
    spawn();

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].destroy();
        }
      },
      snapshot: () => entities.filter((entity) => world.has(entity)).length,
      after: spawn,
    };

    world.destroy();
  });

  bench('destroy entities with 3 traits', function* () {
    const world = createWorld();
    const Tag = trait();
    const entities: Entity[] = [];
    const spawn = () => {
      for (let i = 0; i < 10_000; i++) entities[i] = world.spawn(Position, Velocity, Tag);
    };
    spawn();

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].destroy();
        }
      },
      snapshot: () => entities.filter((entity) => world.has(entity)).length,
      after: spawn,
    };

    world.destroy();
  });
});

group('entity get set 10k @entity @accessor @set', () => {
  bench('entity.get', function* () {
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position({ x: i })));
    }

    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < entities.length; i++) {
        sum += entities[i].get(Position)!.x;
      }
      return sum;
    };

    world.destroy();
    return result;
  });

  bench('entity.get out', function* () {
    const world = createWorld();
    const entities: Entity[] = [];

    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position({ x: i })));
    }

    const out = entities[0].get(Position)!;

    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < entities.length; i++) {
        sum += entities[i].get(Position, out)!.x;
      }
      return sum;
    };

    world.destroy();
    return result;
  });

  bench('entity.set', function* () {
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position));
    }

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].set(Position, { x: i, y: i, z: i });
        }
      },
      snapshot: () => entities[entities.length - 1].get(Position),
    };

    world.destroy();
  });
});
