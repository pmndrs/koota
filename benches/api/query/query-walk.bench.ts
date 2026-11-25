import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ x: 0, y: 0 });
const Dirty = trait();

/** Walks 10k entities with the view iterator and with each. */
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
      sum = 0;
      for (const entity of world.query(query)) sum = (sum + entity) | 0;
    };
    world.destroy();
    return sum;
  });

  bench('view each', function* () {
    const { world, query } = setup();
    let sum = 0;
    yield () => {
      sum = 0;
      world.query(query).each((_position, _velocity, entity) => {
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
      world.query(query).each((position) => {
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

  bench('each', function* () {
    const { world, query, checksum } = setup();
    yield () => {
      world.query(query).each((position, velocity) => {
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

/** Sheds a tag from every entity of the walked query, which defers each removal to the next run. */
group('shed tag in each @query @query-walk @removal', () => {
  for (const [count, walks] of [
    [1, 1000],
    [1000, 1],
  ] as const) {
    bench(`${count} per walk x${walks}`, function* () {
      const world = createWorld();
      const entities = Array.from({ length: count }, () => world.spawn(Position, Dirty));
      const query = createQuery(Position, Dirty);
      const shed = (_position: unknown, entity: Entity) => {
        entity.remove(Dirty);
      };
      let left = 0;
      yield () => {
        for (let w = 0; w < walks; w++) {
          world.query(query).each(shed);
          // Reading the query commits the removals before the tag returns.
          left += world.query(query).length;
          for (let i = 0; i < count; i++) entities[i].add(Dirty);
        }
      };
      world.destroy();
      return left;
    });
  }
});
