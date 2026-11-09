import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { relation, trait } from 'koota';
import { createWorld } from 'koota/entity-methods';

const Position = trait({ x: 0 });
const ChildOf = relation();
const VisibleIn = relation();
const LayerOf = relation();

group('inline concrete targets @query @query-targets', () => {
  for (const count of [1, 2, 3]) {
    bench(`${count} target pairs`, function* () {
      const world = createWorld();
      const parent = world.spawn();
      const viewport = world.spawn();
      const layer = world.spawn();
      const entity = world.spawn(Position, ChildOf(parent), VisibleIn(viewport), LayerOf(layer));
      const query =
        count === 1
          ? () => world.query(ChildOf(parent), Position)
          : count === 2
            ? () => world.query(ChildOf(parent), VisibleIn(viewport), Position)
            : () => world.query(ChildOf(parent), VisibleIn(viewport), LayerOf(layer), Position);
      // Warm a shared prefix as well as the measured shape.
      world.query(ChildOf(parent), Position);
      assert.deepEqual(query().toArray(), [entity]);

      yield query;

      assert.deepEqual(query().toArray(), [entity]);
      world.destroy();
    });
  }

  for (const destroyed of ['outer', 'inner'] as const) {
    bench(`create query and destroy ${destroyed} target`, function* () {
      const world = createWorld({ retain: 0 });
      const surviving = world.spawn();
      const result = yield () => {
        const target = world.spawn();
        const parent = destroyed === 'outer' ? target : surviving;
        const viewport = destroyed === 'inner' ? target : surviving;
        const entity = world.spawn(Position, ChildOf(parent), VisibleIn(viewport));
        const count = world.query(ChildOf(parent), VisibleIn(viewport), Position).length;
        target.destroy();
        entity.destroy();
        return count;
      };

      assert.equal(result, 1);
      assert.equal(world.entities.length, 2);
      world.destroy();
    });
  }
});
