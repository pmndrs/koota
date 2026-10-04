import { assert, bench, group } from '@pmndrs/labs';
import { createChanged, createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Changed = createChanged();

group('manual change notifications 10k @change @notification', () => {
  bench('entity.changed subscribed', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
    let notifications = 0;
    world.onChange(Position, () => notifications++);

    yield {
      bench: () => {
        notifications = 0;
        for (let i = 0; i < entities.length; i++) entities[i].changed(Position);
      },
      snapshot: () => {
        assert.equal(notifications, entities.length);
        return entities.length;
      },
    };

    world.destroy();
  });
});

group('change detection 50k @change @query', () => {
  for (const changeCount of [10, 100, 1000]) {
    bench(`${changeCount} changed`, function* () {
      const world = createWorld();
      const entities: Entity[] = [];
      for (let i = 0; i < 50_000; i++) {
        entities.push(world.spawn(Position, Velocity));
      }
      world.query(Changed(Position));

      const step = Math.floor(50_000 / changeCount);
      const result = yield () => {
        for (let i = 0; i < changeCount; i++) {
          entities[i * step].set(Position, { x: i, y: i, z: i });
        }
        return world.query(Changed(Position));
      };

      world.destroy();
      assert.equal(result.length, changeCount);
      return result.length;
    });
  }
});
