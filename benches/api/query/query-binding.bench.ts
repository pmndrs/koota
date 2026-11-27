import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createWorld, relation, trait } from 'koota';
import { warmWalks } from '../../warm-walks';

for (const count of [1, 10_000]) {
  group(`relation binding ${count} sources @query-binding`, () => {
    bench('concrete target each', function* () {
      warmWalks();
      const world = createWorld();
      const Parent = relation({ exclusive: true });
      const parent = world.spawn();
      let expected = 0;
      for (let i = 0; i < count; i++) expected += world.spawn(Parent(parent));

      // The walk records each entity by its place in the list. A total kept in a variable outside
      // the callback would make every step wait on the one before it and hide the walk.
      const seen: number[] = Array.from({ length: count }, () => 0);
      yield {
        bench: () => {
          world.query(Parent(parent)).each((entity, i) => {
            seen[i] = entity;
          });
        },
        snapshot: () => {
          const sum = seen.reduce((sum, entity) => sum + entity, 0);
          assert.equal(sum, expected);
          return sum;
        },
      };
      world.destroy();
    });

    bench('equivalent filtered selection each', function* () {
      warmWalks();
      const world = createWorld();
      const Parent = relation({ exclusive: true });
      const Contains = relation();
      const Active = trait();
      const Position = trait({ x: 1 });
      // The walks sum into this trait, as a system would. It starts at a fraction so its column
      // holds floats from the first write.
      const Total = trait({ value: 0.5 });
      const parent = world.spawn();
      const active = world.spawn(Active);
      const idle = world.spawn();
      for (let i = 0; i < count; i++) {
        world.spawn(Parent(parent), Position, Total, Contains(active), Contains(idle));
      }
      const query = world.query(Parent(parent), Position, Total, Contains(Active));
      let frames = 0;

      yield {
        bench: () => {
          frames++;
          query
            .select(Parent(parent), Position, Total, Contains(Active))
            .each((position, total, targets) => {
              total.value += position.x + targets[0];
            });
        },
        snapshot: () => {
          assert.equal(query.at(count - 1)!.get(Total)!.value, 0.5 + (1 + active) * frames);
          return query.length;
        },
      };
      world.destroy();
    });
  });
}
