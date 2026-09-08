import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, relation, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });
const Health = trait({ hp: 100 });
const IsPlayer = trait();
const IsActive = trait();
const ChildOf = relation();

// Warm the cache before measurement. Relation filters are constructed in the timed
// calls, with a trait before each filter to exercise recursive hashing.
group('createQuery cache hit @query @query-api', () => {
  bench('3 traits', function* () {
    const expected = createQuery(Position, Velocity, Health);

    yield () => createQuery(Position, Velocity, Health);

    assert.equal(createQuery(Position, Velocity, Health), expected);
  });

  bench('relation target filter', function* () {
    const expected = createQuery(Position, ChildOf(IsPlayer));
    assert.notEqual(createQuery(Velocity, ChildOf(IsPlayer)), expected);

    yield () => createQuery(Position, ChildOf(IsPlayer));

    assert.equal(createQuery(Position, ChildOf(IsPlayer)), expected);
  });

  bench('nested relation target filter', function* () {
    const expected = createQuery(Position, ChildOf(IsPlayer, ChildOf(IsActive)));
    assert.notEqual(createQuery(Velocity, ChildOf(IsPlayer, ChildOf(IsActive))), expected);

    yield () => createQuery(Position, ChildOf(IsPlayer, ChildOf(IsActive)));

    assert.equal(createQuery(Position, ChildOf(IsPlayer, ChildOf(IsActive))), expected);
  });
});

function setupWorld() {
  const world = createWorld();
  const grandparent = world.spawn(IsActive);
  const parent = world.spawn(IsPlayer, ChildOf(grandparent));
  const entity = world.spawn(Position, Velocity, Health, ChildOf(parent));
  // A nonmatching sibling makes loss of the leading trait observable.
  world.spawn(ChildOf(parent));
  return { world, entity };
}

// One matching entity keeps result materialization small and constant while
// measuring the public inline query path, including hashing and the cache lookup.
group('world.query inline cache hit @query @query-api', () => {
  bench('3 traits', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(Position, Velocity, Health)), [entity]);

    yield () => world.query(Position, Velocity, Health);

    assert.deepEqual(Array.from(world.query(Position, Velocity, Health)), [entity]);
    world.destroy();
  });

  bench('relation target filter', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(IsActive, ChildOf(IsPlayer))), []);
    assert.deepEqual(Array.from(world.query(Position, ChildOf(IsPlayer))), [entity]);

    yield () => world.query(Position, ChildOf(IsPlayer));

    assert.deepEqual(Array.from(world.query(Position, ChildOf(IsPlayer))), [entity]);
    world.destroy();
  });

  bench('nested relation target filter', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(IsActive, ChildOf(IsPlayer, ChildOf(IsActive)))), []);
    assert.deepEqual(Array.from(world.query(Position, ChildOf(IsPlayer, ChildOf(IsActive)))), [
      entity,
    ]);

    yield () => world.query(Position, ChildOf(IsPlayer, ChildOf(IsActive)));

    assert.deepEqual(Array.from(world.query(Position, ChildOf(IsPlayer, ChildOf(IsActive)))), [
      entity,
    ]);
    world.destroy();
  });
});
