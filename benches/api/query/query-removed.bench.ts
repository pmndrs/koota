import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createRemoved, createWorld, trait } from 'koota';
import { warmWalks } from '../../warm-walks';

group('Removed remove + read 10k @removed', () => {
  for (const readers of [1, 16]) {
    bench(`${readers} readers`, function* () {
      warmWalks();
      const Position = trait({ x: 1 });
      // The walks sum into this trait, as a system would. It starts at a fraction so its column
      // holds floats from the first write.
      const Total = trait({ value: 0.5 });
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position, Total));
      const queries = Array.from({ length: readers }, () =>
        createQuery(createRemoved()(Position), Total)
      );
      for (const query of queries) world.query(query);
      let frames = 0;

      yield {
        bench: () => {
          frames++;
          for (const entity of entities) {
            entity.add(Position);
            entity.remove(Position);
          }
          for (const query of queries) {
            world.query(query).each((position, total) => {
              total.value += position.x;
            });
          }
        },
        snapshot: () => {
          assert.equal(entities[9999].get(Total), { value: 0.5 + readers * frames });
          return entities.length;
        },
      };

      world.destroy();
    });
  }
});

group('Removed destroy + read + recycle 10k @removed', () => {
  for (const [retain, readers] of [
    [0, 1],
    [1024, 1],
    [1024, 16],
  ]) {
    bench(`retain ${retain}, ${readers} readers`, function* () {
      warmWalks();
      const Position = trait({ x: 1 });
      // The walks sum into this trait, as a system would. It starts at a fraction so its column
      // holds floats from the first write.
      const Total = trait({ value: 0.5 });
      const world = createWorld({ retain });
      const queries = Array.from({ length: readers }, () =>
        createQuery(createRemoved()(Position), Total)
      );
      for (const query of queries) world.query(query);
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position, Total));
      let seen = 0;
      yield {
        bench: () => {
          for (const entity of entities) entity.destroy();
          seen = 0;
          for (const query of queries) {
            const removed = world.query(query);
            seen += removed.length;
            removed.each((position, total) => {
              total.value += position.x;
            });
          }
          for (let i = 0; i < entities.length; i++) entities[i] = world.spawn(Position, Total);
          return seen;
        },
        snapshot: () => {
          assert.equal(seen, retain * readers);
          assert.equal(world.query(Position).length, entities.length);
          return seen;
        },
      };

      world.destroy();
    });
  }
});
