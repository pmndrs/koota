import { bench, group } from '@pmndrs/labs';
import { createWorld, Name, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });

group('named entities 1k @name @entity', () => {
  bench('camera follows player for 60 frames using lookups', function* () {
    const world = createWorld();
    for (let i = 0; i < 1_000; i++) world.spawn(Position({ x: i }));
    const player = world.spawn(Name('player'), Position);
    const camera = world.spawn(Name('camera'), Position({ z: 10 }));

    yield {
      bench: () => {
        for (let frame = 0; frame < 60; frame++) {
          player.set(Position, { x: frame });
          const target = world.lookup('player')!;
          world.lookup('camera')!.set(Position, { x: target.get(Position)!.x, z: 10 });
        }
      },
      snapshot: () => camera.get(Position),
      after: () => {
        player.set(Position, { x: 0 });
        camera.set(Position, { x: 0 });
      },
    };

    world.destroy();
  });

  bench('find player 1k times with queryFirst', function* () {
    const world = createWorld();
    for (let i = 0; i < 1_000; i++) world.spawn(Position);
    world.spawn(Name('player'), Position);

    const matches = yield () => {
      let matches = 0;
      for (let i = 0; i < 1_000; i++) {
        if (world.queryFirst(Name('player'), Position) !== undefined) matches++;
      }
      return matches;
    };

    world.destroy();
    return matches;
  });

  bench('apply 1k named query updates', function* () {
    const world = createWorld();
    for (let i = 0; i < 1_000; i++) world.spawn(Name(`object-${i}`), Position);
    const updates = Array.from({ length: 1_000 }, (_, i) => ({ id: `object-${i}`, x: i + 1 }));
    // Resolve the query once so this case measures repeated use.
    world.query(Name(updates[0].id), Position);

    yield {
      bench: () => {
        for (const update of updates) {
          world.query(Name(update.id), Position).updateEach(([position]) => {
            position.x = update.x;
          });
        }
      },
      snapshot: () =>
        updates.reduce((sum, update) => sum + world.lookup(update.id)!.get(Position)!.x, 0),
    };

    world.destroy();
  });

  bench('rename 1k scene objects with set', function* () {
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < 1_000; i++) entities.push(world.spawn(Name(`object-${i}`)));
    let prefix = '';

    yield {
      bench: () => {
        prefix = prefix ? '' : 'scene/';
        for (let i = 0; i < entities.length; i++) {
          entities[i].set(Name, `${prefix}object-${i}`);
        }
      },
      snapshot: () =>
        entities.filter((entity, i) => world.lookup(`${prefix}object-${i}`) === entity).length,
    };

    world.destroy();
  });
});
