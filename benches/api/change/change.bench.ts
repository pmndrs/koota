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
  bench('100 changed', function* () {
    const changeCount = 100;
    const world = createWorld();
    const entities: Entity[] = [];
    for (let i = 0; i < 50_000; i++) {
      entities.push(world.spawn(Position, Velocity));
    }
    world.query(Changed(Position));

    const step = Math.floor(50_000 / changeCount);
    // The batch is live until the next run, so take its size now.
    const result = yield () => {
      for (let i = 0; i < changeCount; i++) {
        entities[i * step].set(Position, { x: i, y: i, z: i });
      }
      return world.query(Changed(Position)).length;
    };

    world.destroy();
    assert.equal(result, changeCount);
    return result;
  });
});

group('set under a filtered Changed query 10k @change @filtered', () => {
  const tags = Array.from({ length: 4 }, () => trait());

  const write = (entities: Entity[]) => {
    for (let i = 0; i < entities.length; i++) entities[i].set(Position, { x: i, y: i, z: i });
  };

  bench('outside the filter of 4 Changed queries', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
    for (const tag of tags) world.query(tag, Changed(Position));

    const result = yield () => {
      write(entities);
      let matched = 0;
      for (const tag of tags) matched += world.query(tag, Changed(Position)).length;
      return matched;
    };

    world.destroy();
    assert.equal(result, 0);
  });

  bench('1 percent inside the filter', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, (_, i) =>
      i % 100 === 0 ? world.spawn(Position, tags[0]) : world.spawn(Position)
    );
    world.query(tags[0], Changed(Position));

    const result = yield () => {
      write(entities);
      return world.query(tags[0], Changed(Position)).length;
    };

    world.destroy();
    assert.equal(result, 100);
  });

  bench('all inside the filter', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position, tags[0]));
    world.query(tags[0], Changed(Position));

    const result = yield () => {
      write(entities);
      return world.query(tags[0], Changed(Position)).length;
    };

    world.destroy();
    assert.equal(result, 10_000);
  });
});
