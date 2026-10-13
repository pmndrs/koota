import { bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

const A = trait({ x: 0 });
const B = trait({ x: 0 });
const C = trait({ x: 0 });

group('inline query call @query @inline', () => {
  const setup = () => {
    const world = createWorld();
    world.spawn(A, B, C);
    world.query(A);
    world.query(A, B);
    world.query(A, B, C);
    return world;
  };

  bench('1 trait', function* () {
    const world = setup();
    yield () => world.query(A);
    world.destroy();
  });

  bench('2 traits', function* () {
    const world = setup();
    yield () => world.query(A, B);
    world.destroy();
  });

  bench('3 traits', function* () {
    const world = setup();
    yield () => world.query(A, B, C);
    world.destroy();
  });
});
