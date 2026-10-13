import { bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });
const Mass = trait(() => ({ v: 1 }));

function setup(count: number) {
  const world = createWorld();
  const entities: Entity[] = [];
  for (let i = 0; i < count; i++) entities.push(world.spawn(Position({ x: i }), Mass));
  return { world, entities };
}

group('entity accessor micro 1k x100 @accessor', () => {
  bench('acc get soa', function* () {
    const { world, entities } = setup(1000);
    const result = yield () => {
      let sum = 0;
      for (let r = 0; r < 100; r++)
        for (let i = 0; i < entities.length; i++) sum += entities[i].get(Position)!.x;
      return sum;
    };
    world.destroy();
    return result;
  });

  bench('acc get aos', function* () {
    const { world, entities } = setup(1000);
    const result = yield () => {
      let sum = 0;
      for (let r = 0; r < 100; r++)
        for (let i = 0; i < entities.length; i++) sum += entities[i].get(Mass)!.v;
      return sum;
    };
    world.destroy();
    return result;
  });

  bench('acc get missing', function* () {
    const { world, entities } = setup(1000);
    const result = yield () => {
      let n = 0;
      for (let r = 0; r < 100; r++)
        for (let i = 0; i < entities.length; i++) if (entities[i].get(Velocity) === undefined) n++;
      return n;
    };
    world.destroy();
    return result;
  });

  bench('acc has', function* () {
    const { world, entities } = setup(1000);
    const result = yield () => {
      let n = 0;
      for (let r = 0; r < 100; r++)
        for (let i = 0; i < entities.length; i++) if (entities[i].has(Position)) n++;
      return n;
    };
    world.destroy();
    return result;
  });

  bench('acc set no-track', function* () {
    const { world, entities } = setup(1000);
    const value = { x: 1, y: 2, z: 3 };
    yield {
      bench: () => {
        for (let r = 0; r < 100; r++)
          for (let i = 0; i < entities.length; i++) entities[i].set(Position, value);
      },
      snapshot: () => entities[0].get(Position),
    };
    world.destroy();
  });

  bench('acc set silent', function* () {
    const { world, entities } = setup(1000);
    const value = { x: 1, y: 2, z: 3 };
    yield {
      bench: () => {
        for (let r = 0; r < 100; r++)
          for (let i = 0; i < entities.length; i++) entities[i].set(Position, value, false);
      },
      snapshot: () => entities[0].get(Position),
    };
    world.destroy();
  });

  bench('acc add existing', function* () {
    const { world, entities } = setup(1000);
    yield {
      bench: () => {
        for (let r = 0; r < 100; r++)
          for (let i = 0; i < entities.length; i++) entities[i].add(Position);
      },
      snapshot: () => entities[0].has(Position),
    };
    world.destroy();
  });
});
