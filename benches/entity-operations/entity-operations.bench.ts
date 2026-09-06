import { bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });

group('spawn throughput 10k @entity', () => {
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
});

group('entity.has dispatch 10k @entity', () => {
  bench('entity.has (true)', function* () {
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

  bench('entity.has (false)', function* () {
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position));
    }

    const result = yield () => {
      let matches = 0;
      for (let i = 0; i < entities.length; i++) {
        if (entities[i].has(Velocity)) matches++;
      }
      return matches;
    };

    world.destroy();
    return result;
  });
});

group('entity.destroy 10k @entity', () => {
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

group('entity get set 10k @entity', () => {
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
