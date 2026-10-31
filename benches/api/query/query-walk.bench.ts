import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait } from 'koota';

const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ x: 0, y: 0 });

/** Walks 10k entities with the view iterator and with readEach. */
group('entity walk 10k @query @query-walk', () => {
  const setup = () => {
    const world = createWorld();
    for (let i = 0; i < 10_000; i++) world.spawn(Position({ x: i }), Velocity);
    const query = createQuery(Position, Velocity);
    return { world, query };
  };

  bench('view for of', function* () {
    const { world, query } = setup();
    let sum = 0;
    yield () => {
      for (const entity of world.query(query)) sum = (sum + entity) | 0;
    };
    world.destroy();
    return sum;
  });

  bench('view readEach', function* () {
    const { world, query } = setup();
    let sum = 0;
    yield () => {
      world.query(query).readEach((_, entity) => {
        sum = (sum + entity) | 0;
      });
    };
    world.destroy();
    return sum;
  });
});

/** Integrates velocity into position for 10k entities with each access style. */
group('movement 10k @query @query-walk @movement', () => {
  const setup = () => {
    const world = createWorld();
    for (let i = 0; i < 10_000; i++) world.spawn(Position({ x: i }), Velocity({ x: 1, y: 2 }));
    const query = createQuery(Position, Velocity);
    // x advances by 1 and y by 2 per step, so x - y / 2 recovers the spawn index whatever the count.
    const checksum = () => {
      let sum = 0;
      world.query(query).readEach(([position]) => {
        sum = (sum + position.x - position.y / 2) | 0;
      });
      world.destroy();
      return sum;
    };
    return { world, query, checksum };
  };

  bench('for of + get + set', function* () {
    const { world, query, checksum } = setup();
    yield () => {
      for (const entity of world.query(query)) {
        const position = entity.get(Position)!;
        const velocity = entity.get(Velocity)!;
        entity.set(Position, { x: position.x + velocity.x, y: position.y + velocity.y });
      }
    };
    return checksum();
  });

  bench('updateEach', function* () {
    const { world, query, checksum } = setup();
    yield () => {
      world.query(query).updateEach(([position, velocity]) => {
        position.x += velocity.x;
        position.y += velocity.y;
      });
    };
    return checksum();
  });

  bench('getPages loop', function* () {
    const { world, query, checksum } = setup();
    yield () => {
      for (const { stores, indices } of world.query(query).getPages()) {
        const [position, velocity] = stores;
        for (let i = 0; i < indices.length; i++) {
          const offset = indices[i];
          position.x[offset] += velocity.x[offset];
          position.y[offset] += velocity.y[offset];
        }
      }
    };
    return checksum();
  });
});
