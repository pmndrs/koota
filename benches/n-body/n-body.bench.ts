import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait, type World } from 'koota';
import { mulberry32 } from 'math/random';

const Position = trait({ x: 0, y: 0 });
const Acceleration = trait({ x: 0, y: 0 });

group('N-body 2k @n-body @pages', () => {
  for (const run of [updateEach, getPages]) {
    bench(run.name, function* () {
      const world = createWorld();
      const random = mulberry32.create(42);
      for (let i = 0; i < 2000; i++) {
        world.spawn(
          Position({ x: mulberry32.sample(random) * 1000, y: mulberry32.sample(random) * 1000 }),
          Acceleration
        );
        // Leave gaps to exercise sparse pages.
        world.spawn();
      }

      const checksum = () => {
        let x = 0;
        let y = 0;
        world.query(Acceleration).readEach(([acceleration], entity) => {
          x += acceleration.x * (entity.id() + 1);
          y += acceleration.y * (entity.id() + 1);
        });
        return [x, y];
      };

      updateEach(world);
      const expected = checksum();
      // Warm up the repeated frame work before measurement.
      for (let i = 0; i < 20; i++) run(world);
      world.query(Acceleration).updateEach(([acceleration]) => {
        acceleration.x = 0;
        acceleration.y = 0;
      });

      // Positions stay fixed and each pass overwrites acceleration.
      yield {
        bench: () => run(world),
        snapshot: () => {
          const actual = checksum();
          assert.equal(actual, expected);
          return actual;
        },
      };
      world.destroy();
    }).baseline(run === updateEach);
  }
});

function updateEach(world: World) {
  const sources = world.query(Position);
  world.query(Position, Acceleration).updateEach(
    ([position, acceleration]) => {
      let x = 0;
      let y = 0;
      sources.readEach(([other]) => {
        const dx = other.x - position.x;
        const dy = other.y - position.y;
        const inverseDistance = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const force = inverseDistance * inverseDistance * inverseDistance;
        x += dx * force;
        y += dy * force;
      });
      acceleration.x = x;
      acceleration.y = y;
    },
    { changeDetection: 'never' }
  );
}

function getPages(world: World) {
  const pages = world.query(Position, Acceleration).getPages();
  for (const {
    stores: [position, acceleration],
    indices,
  } of pages) {
    for (let i = 0; i < indices.length; i++) {
      const a = indices[i];
      let x = 0;
      let y = 0;
      for (const {
        stores: [other],
        indices: otherIndices,
      } of pages) {
        for (let j = 0; j < otherIndices.length; j++) {
          const b = otherIndices[j];
          const dx = other.x[b] - position.x[a];
          const dy = other.y[b] - position.y[a];
          const inverseDistance = 1 / Math.sqrt(dx * dx + dy * dy + 1);
          const force = inverseDistance * inverseDistance * inverseDistance;
          x += dx * force;
          y += dy * force;
        }
      }
      acceleration.x[a] = x;
      acceleration.y[a] = y;
    }
  }
}
