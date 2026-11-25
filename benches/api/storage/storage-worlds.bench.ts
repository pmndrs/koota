import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

group('small trait-diverse worlds @storage @storage-scene', () => {
  const traits = Array.from({ length: 30 }, () =>
    trait({ a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], x: 0, y: 0, z: 0, w: 0 })
  );
  const tags = Array.from({ length: 30 }, () => trait());
  const Pose = trait({ p: [0, 0, 0], q: [0, 0, 0, 1], scale: 1 });

  bench('create 10 worlds with 43 entities and 30 rare traits each', function* () {
    let worlds: ReturnType<typeof createWorld>[];
    yield {
      bench: () => {
        worlds = Array.from({ length: 10 }, () => {
          const world = createWorld();
          const entities = Array.from({ length: 43 }, () => world.spawn(Pose));
          world.add(...tags);
          for (let i = 0; i < traits.length; i++) {
            entities[Math.floor((i * entities.length) / traits.length)].add(traits[i]);
          }
          return world;
        });
      },
      snapshot: () => {
        for (const world of worlds) {
          assert.equal(world.query(Pose).length, 43);
          for (const Trait of traits) assert.equal(world.query(Trait).length, 1);
        }
        return worlds.length * 43;
      },
      after: () => {
        for (const world of worlds) world.destroy();
      },
    };
  });
});

group('storage allocation @storage @storage-allocation', () => {
  const Wide = trait({ a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], x: 0, y: 0, z: 0, w: 0 });

  bench('spawn 10000 wide', function* () {
    const world = createWorld({ retain: 0 });
    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.spawn(Wide);
      },
      snapshot: () => {
        assert.equal(world.query(Wide).length, 10_000);
        return 10_000;
      },
      after: () => world.reset(),
    };
    world.destroy();
  });
});
