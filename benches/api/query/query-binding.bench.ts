import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createWorld, relation, trait } from 'koota';

for (const count of [1, 10_000]) {
  group(`relation binding ${count} sources @query-binding`, () => {
    bench('concrete target each', function* () {
      const world = createWorld();
      const Parent = relation({ exclusive: true });
      const parent = world.spawn();
      let expected = 0;
      for (let i = 0; i < count; i++) expected += world.spawn(Parent(parent));

      const result = yield () => {
        let sum = 0;
        world.query(Parent(parent)).each((entity) => {
          sum += entity;
        });
        return sum;
      };

      assert.equal(result, expected);
      world.destroy();
    });

    bench('equivalent filtered selection each', function* () {
      const world = createWorld();
      const Parent = relation({ exclusive: true });
      const Contains = relation();
      const Active = trait();
      const Position = trait({ x: 1 });
      const parent = world.spawn();
      const active = world.spawn(Active);
      const idle = world.spawn();
      for (let i = 0; i < count; i++) {
        world.spawn(Parent(parent), Position, Contains(active), Contains(idle));
      }
      const query = world.query(Parent(parent), Position, Contains(Active));

      const result = yield () => {
        let sum = 0;
        query.select(Parent(parent), Position, Contains(Active)).each((position, targets) => {
          sum += position.x + targets[0];
        });
        return sum;
      };

      assert.equal(result, count * (1 + active));
      world.destroy();
    });
  });
}
