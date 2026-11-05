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
  const TagA = trait();
  const TagB = trait();
  const TagC = trait();
  const TagD = trait();
  const tags = [TagA, TagB, TagC, TagD];

  const write = (entities: Entity[]) => {
    for (let i = 0; i < entities.length; i++) entities[i].set(Position, { x: i, y: i, z: i });
  };

  bench('no Changed query', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
    yield () => write(entities);
    world.destroy();
  });

  for (const count of [1, 4]) {
    bench(`outside the filter of ${count} Changed queries`, function* () {
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
      for (let i = 0; i < count; i++) world.query(tags[i], Changed(Position));

      const result = yield () => {
        write(entities);
        let matched = 0;
        for (let i = 0; i < count; i++) matched += world.query(tags[i], Changed(Position)).length;
        return matched;
      };

      world.destroy();
      assert.equal(result, 0);
    });
  }

  bench('1 percent inside the filter', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, (_, i) =>
      i % 100 === 0 ? world.spawn(Position, TagA) : world.spawn(Position)
    );
    world.query(TagA, Changed(Position));

    const result = yield () => {
      write(entities);
      return world.query(TagA, Changed(Position)).length;
    };

    world.destroy();
    assert.equal(result, 100);
  });

  bench('all inside the filter', function* () {
    const world = createWorld();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Position, TagA));
    world.query(TagA, Changed(Position));

    const result = yield () => {
      write(entities);
      return world.query(TagA, Changed(Position)).length;
    };

    world.destroy();
    assert.equal(result, 10_000);
  });
});
