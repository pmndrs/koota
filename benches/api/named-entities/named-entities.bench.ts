import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, identifier, trait } from 'koota';

const Name = identifier();
const Position = trait({ x: 0, y: 0, z: 0 });

group('named entities 1k @name @identifier @entity', () => {
  bench('camera follows player for 60 frames using lookups', function* () {
    const world = createWorld();
    for (let i = 0; i < 1_000; i++) world.spawn(Position({ x: i }));
    const player = world.spawn(Name('player'), Position);
    const camera = world.spawn(Name('camera'), Position({ z: 10 }));

    yield {
      bench: () => {
        for (let frame = 0; frame < 60; frame++) {
          player.set(Position, { x: frame });
          const target = world.lookup(Name('player'))!;
          world.lookup(Name('camera'))!.set(Position, { x: target.get(Position)!.x, z: 10 });
        }
      },
      snapshot: () => {
        const position = camera.get(Position);
        assert.deepEqual(position, { x: 59, y: 0, z: 10 });
        return position;
      },
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

    assert.equal(matches, 1_000);
    world.destroy();
    return matches;
  });

  bench('read 1k numeric identifier targets', function* () {
    const WireId = identifier<number>();
    const world = createWorld();
    const entities = Array.from({ length: 1_000 }, (_, i) => world.spawn(WireId(i)));

    const sum = yield () => {
      let sum = 0;
      for (const entity of entities) sum += entity.targetFor(WireId)!;
      return sum;
    };

    assert.equal(sum, 499_500);
    world.destroy();
    return sum;
  });

  bench('apply 1k named query updates', function* () {
    const world = createWorld();
    for (let i = 0; i < 1_000; i++) world.spawn(Name(`object-${i}`), Position);
    const updates = Array.from({ length: 1_000 }, (_, i) => ({ id: `object-${i}`, x: i + 1 }));
    yield {
      bench: () => {
        for (const update of updates) {
          world.query(Name(update.id), Position).updateEach(([position]) => {
            position.x = update.x;
          });
        }
      },
      snapshot: () => {
        const sum = updates.reduce(
          (sum, update) => sum + world.lookup(Name(update.id))!.get(Position)!.x,
          0
        );
        assert.equal(sum, 500_500);
        return sum;
      },
    };

    world.destroy();
  });

  for (const cached of [false, true]) {
    bench(
      cached
        ? 'reassign 1k scene identifiers with a cached query per key'
        : 'reassign 1k scene identifiers',
      function* () {
        const world = createWorld();
        const entities = Array.from({ length: 1_000 }, (_, i) => world.spawn(Name(`object-${i}`)));
        const queries = cached ? entities.map((_, i) => createQuery(Name(`object-${i}`))) : [];
        for (const query of queries) world.query(query);
        let prefix = '';

        yield {
          bench: () => {
            prefix = prefix ? '' : 'scene/';
            for (let i = 0; i < entities.length; i++) {
              entities[i].add(Name(`${prefix}object-${i}`));
            }
          },
          snapshot: () => {
            const matches = entities.filter(
              (entity, i) => world.lookup(Name(`${prefix}object-${i}`)) === entity
            ).length;
            assert.equal(matches, 1_000);
            // Query maintenance must stay correct as keys move into and out of the cached set.
            for (let i = 0; i < queries.length; i++) {
              assert.deepEqual(world.query(queries[i]).toArray(), prefix ? [] : [entities[i]]);
            }
            return matches;
          },
        };

        world.destroy();
      }
    );
  }
});
