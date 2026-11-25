import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait, type Entity, type World } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });
const Mass = trait({ value: 1 });

// Each pair runs one workload through the world and through entity methods, so the cost of
// finding the world from a bare id shows up side by side.

group('world-first accessors 10k @world-first @accessor', () => {
  bench('world.has', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));

    const result = yield () => {
      let matches = 0;
      for (let i = 0; i < entities.length; i++) {
        if (world.has(entities[i], Position)) matches++;
      }
      return matches;
    };

    world.destroy();
    return result;
  });

  bench('entity.has', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));

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

  bench('world.get out', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, (_, i) => world.spawn(Position({ x: i })));
    const out = Position.record();

    const result = yield () => {
      let sum = 0;
      for (let i = 0; i < entities.length; i++) {
        sum += world.get(entities[i], Position, out)!.x;
      }
      return sum;
    };

    world.destroy();
    return result;
  });

  bench('entity.get out', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, (_, i) => world.spawn(Position({ x: i })));
    const out = Position.record();

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

  bench('world.set', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          world.set(entities[i], Position, { x: i, y: i, z: i });
        }
      },
      snapshot: () => world.get(entities[entities.length - 1], Position),
    };

    world.destroy();
  });

  bench('entity.set', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));

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

group('world-first mutations 10k @world-first @mutation', () => {
  bench('world.add + remove, 1 query', function* () {
    const Tag = trait();
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn());
    const ref = createQuery(Tag);
    world.query(ref);

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          world.add(entities[i], Tag);
          world.remove(entities[i], Tag);
        }
      },
      snapshot: () => {
        assert.equal(world.query(ref).length, 0);
        return entities.length;
      },
    };

    world.destroy();
  });

  bench('entity.add + remove, 1 query', function* () {
    const Tag = trait();
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn());
    const ref = createQuery(Tag);
    world.query(ref);

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) {
          entities[i].add(Tag);
          entities[i].remove(Tag);
        }
      },
      snapshot: () => {
        assert.equal(world.query(ref).length, 0);
        return entities.length;
      },
    };

    world.destroy();
  });

  bench('world.spawn + destroy, 3 traits', function* () {
    const world = createWorld();
    const entities: Entity[] = [];

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) entities.push(world.spawn(Position, Velocity, Mass));
        for (let i = 0; i < entities.length; i++) world.destroy(entities[i]);
        entities.length = 0;
      },
      snapshot: () => world.query(Position).length,
    };

    world.destroy();
  });

  bench('entity spawn + destroy, 3 traits', function* () {
    const world = createWorld();
    const entities: Entity[] = [];

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) entities.push(world.spawn(Position, Velocity, Mass));
        for (let i = 0; i < entities.length; i++) entities[i].destroy();
        entities.length = 0;
      },
      snapshot: () => world.query(Position).length,
    };

    world.destroy();
  });
});

// A system takes its world as an argument, so one call site serves every world. These run two
// worlds through one site. The worlds are read from an array so the optimizer cannot treat
// either as a constant.

group('world-first across two worlds 10k @world-first @multi-world', () => {
  const populate = () =>
    [createWorld(), createWorld()].map((world) => ({
      world,
      entities: Array.from({ length: 5_000 }, () => world.spawn(Position)),
    }));

  const countWithWorld = (world: World, entities: Entity[]) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      if (world.has(entities[i], Position)) matches++;
    }
    return matches;
  };

  const countWithMethods = (entities: Entity[]) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      if (entities[i].has(Position)) matches++;
    }
    return matches;
  };

  const writeWithWorld = (world: World, entities: Entity[]) => {
    for (let i = 0; i < entities.length; i++) {
      world.set(entities[i], Position, { x: i, y: i, z: i });
    }
  };

  const writeWithMethods = (entities: Entity[]) => {
    for (let i = 0; i < entities.length; i++) {
      entities[i].set(Position, { x: i, y: i, z: i });
    }
  };

  bench('world.has', function* () {
    const worlds = populate();

    const result = yield () => {
      let matches = 0;
      for (let w = 0; w < worlds.length; w++) {
        matches += countWithWorld(worlds[w].world, worlds[w].entities);
      }
      return matches;
    };

    for (const { world } of worlds) world.destroy();
    return result;
  });

  bench('entity.has', function* () {
    const worlds = populate();

    const result = yield () => {
      let matches = 0;
      for (let w = 0; w < worlds.length; w++) matches += countWithMethods(worlds[w].entities);
      return matches;
    };

    for (const { world } of worlds) world.destroy();
    return result;
  });

  bench('world.set', function* () {
    const worlds = populate();

    yield {
      bench: () => {
        for (let w = 0; w < worlds.length; w++) {
          writeWithWorld(worlds[w].world, worlds[w].entities);
        }
      },
      snapshot: () => worlds[1].world.get(worlds[1].entities[4_999], Position),
    };

    for (const { world } of worlds) world.destroy();
  });

  bench('entity.set', function* () {
    const worlds = populate();

    yield {
      bench: () => {
        for (let w = 0; w < worlds.length; w++) writeWithMethods(worlds[w].entities);
      },
      snapshot: () => worlds[1].entities[4_999].get(Position),
    };

    for (const { world } of worlds) world.destroy();
  });
});
