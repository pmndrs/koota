import { bench, group } from '@pmndrs/labs';
import { createChanged, createWorld, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });

group('update each 50k @iteration @query', () => {
  const world = createWorld();
  for (let i = 0; i < 50_000; i++) world.spawn(Position, Velocity);

  bench('updateEach 2 soa traits', () => {
    world.query(Position, Velocity).updateEach(([p, v]) => {
      p.x += v.vx;
      p.y += v.vy;
      p.z += v.vz;
    });
  });
  bench('updateEach 1 soa trait never', () => {
    world.query(Position).updateEach(
      ([p]) => {
        p.x += 1;
      },
      { changeDetection: 'never' }
    );
  });
  bench('readEach 2 soa traits', () => {
    let sum = 0;
    world.query(Position, Velocity).readEach(([p, v]) => {
      sum += p.x + v.vx;
    });
    return sum;
  });
});

group('update each tracked 50k @iteration @change @query', () => {
  const world = createWorld();
  for (let i = 0; i < 50_000; i++) world.spawn(Position, Velocity);
  world.onChange(Position, () => {});
  const Changed = createChanged();
  world.query(Changed(Velocity));

  bench('updateEach auto tracked soa', () => {
    world.query(Position, Velocity).updateEach(([p, v]) => {
      p.x += v.vx;
      p.y += 1;
    });
  });
  bench('updateEach always', () => {
    world.query(Position).updateEach(
      ([p]) => {
        p.x += 1;
      },
      { changeDetection: 'always' }
    );
  });
});

group('update each tracked unchanged 50k @iteration @change @query', () => {
  const world = createWorld();
  for (let i = 0; i < 50_000; i++) world.spawn(Position, Velocity);
  world.onChange(Position, () => {});

  bench('updateEach auto tracked no writes', () => {
    let sum = 0;
    world.query(Position, Velocity).updateEach(([p, v]) => {
      sum += p.x + v.vx;
    });
    return sum;
  });
});
