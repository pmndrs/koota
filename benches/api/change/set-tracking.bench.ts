import { bench, group } from '@pmndrs/labs';
import { createChanged, createQuery, createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0 });
const Others = Array.from({ length: 8 }, () => trait({ v: 0 }));
const Changeds = Array.from({ length: 8 }, () => createChanged());
const Changed = Changeds[0];

function setup(trackers: number, distinct: boolean) {
  const world = createWorld();
  const entities: Entity[] = [];
  for (let i = 0; i < 1000; i++) entities.push(world.spawn(Position, ...Others));
  for (let t = 0; t < trackers; t++) {
    if (distinct) world.query(Changeds[t](Position));
    else world.query(Changed(Position, Others[t]));
  }
  return { world, entities };
}

group('set tracking micro 1k x100 @change @accessor', () => {
  for (const [name, trackers, distinct] of [
    ['chgset 0 trackers', 0, false],
    ['chgset 1 tracker', 1, false],
    ['chgset 8 trackers shared', 8, false],
    ['chgset 8 trackers distinct', 8, true],
  ] as const) {
    bench(name, function* () {
      const { world, entities } = setup(trackers, distinct);
      const result = yield () => {
        for (let r = 0; r < 100; r++)
          for (let i = 0; i < entities.length; i++) entities[i].set(Position, { x: r, y: i });
        return entities.length;
      };
      world.destroy();
      return result;
    });
  }
});

group('changed scan 100k @change @query', () => {
  for (const [name, count] of [
    ['stamp scan 0.1% changed', 100],
    ['stamp scan 10% changed', 10_000],
    ['stamp scan 100% changed', 100_000],
  ] as const) {
    bench(name, function* () {
      const world = createWorld();
      const entities: Entity[] = [];
      for (let i = 0; i < 100_000; i++) entities.push(world.spawn(Position));
      const query = createQuery(Changed(Position));
      world.query(query);
      const step = 100_000 / count;
      const result = yield () => {
        for (let i = 0; i < count; i++) entities[i * step].set(Position, { x: i, y: i });
        let sum = 0;
        world.query(query).readEach(([p]) => {
          sum += p.x;
        });
        return sum;
      };
      world.destroy();
      return result;
    });
  }
});

group('tracked updateEach with trackers 10k @change @query', () => {
  for (const trackers of [0, 1, 8]) {
    bench(`stamp updateEach ${trackers} trackers`, function* () {
      const world = createWorld();
      for (let i = 0; i < 10_000; i++) world.spawn(Position);
      for (let t = 0; t < trackers; t++) world.query(Changeds[t](Position));
      const off = world.onChange(Position, () => {});
      const query = createQuery(Position);
      const result = yield () => {
        world.query(query).updateEach(([p]) => {
          p.x++;
        });
        return 0;
      };
      off();
      world.destroy();
      return result;
    });
  }
});
