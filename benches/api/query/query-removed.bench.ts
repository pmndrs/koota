import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createRemoved, createWorld, trait } from 'koota';

group('Removed remove + read 10k @removed', () => {
  for (const readers of [1, 16]) {
    bench(`${readers} readers`, function* () {
      const Position = trait({ x: 1 });
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
      const queries = Array.from({ length: readers }, () => createQuery(createRemoved()(Position)));
      for (const query of queries) world.query(query);
      let sum = 0;

      yield {
        bench: () => {
          for (const entity of entities) {
            entity.add(Position);
            entity.remove(Position);
          }
          sum = 0;
          for (const query of queries) world.query(query).each((position) => (sum += position.x));
          return sum;
        },
        snapshot: () => {
          assert.equal(sum, entities.length * readers);
          return sum;
        },
      };

      world.destroy();
    });
  }
});

for (const retain of [0, 1]) {
  group(`Removed destroy + recycle 10k, retain ${retain} @removed`, () => {
    for (const readers of [0, 1, 16]) {
      bench(`${readers} readers`, function* () {
        const Position = trait({ x: 1 });
        const world = createWorld({ retain });
        const queries = Array.from({ length: readers }, () => createQuery(createRemoved()(Position)));
        for (const query of queries) world.query(query);
        const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
        yield {
          bench: () => {
            for (const entity of entities) entity.destroy();
            for (const query of queries) {
              world.query(query);
              world.query(query);
            }
            for (let i = 0; i < entities.length; i++) entities[i] = world.spawn(Position);
            return entities.length;
          },
          snapshot: () => {
            assert.equal(world.query(Position).length, entities.length);
            return entities.length;
          },
        };

        world.destroy();
      });
    }
  });
}
