import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, Name, Not, relation, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });
const Health = trait({ hp: 100 });
const IsPlayer = trait();
const IsActive = trait();
const ChildOf = relation();

// Warm the cache before measurement. Relation filters are constructed in the timed
// calls, with a trait before each filter to exercise recursive hashing.
group('createQuery cache hit @query @query-api @query-hash', () => {
  bench('3 traits', function* () {
    const expected = createQuery(Position, Velocity, Health);

    yield () => createQuery(Position, Velocity, Health);

    assert.equal(createQuery(Position, Velocity, Health), expected);
  });

  bench('name only', function* () {
    const expected = createQuery(Name('player'));
    yield () => createQuery(Name('player'));
    assert.equal(createQuery(Name('player')), expected);
  });

  bench('name + 2 traits', function* () {
    const expected = createQuery(Name('player'), Position, Velocity);
    yield () => createQuery(Name('player'), Position, Velocity);
    assert.equal(createQuery(Velocity, Name('player'), Position), expected);
  });

  bench('1k stable object IDs', function* () {
    const ids = Array.from({ length: 1_000 }, (_, i) => `object-${i}`);
    const expected = ids.map((id) => createQuery(Name(id), Position));
    const result = yield () => {
      let matches = 0;
      for (let i = 0; i < ids.length; i++) {
        if (createQuery(Name(ids[i]), Position) === expected[i]) matches++;
      }
      return matches;
    };
    assert.equal(result, 1_000);
    return result;
  });
});

group('createQuery relation cache hit @query @query-api @query-hash @relation-hash', () => {
  bench('concrete target', function* () {
    const world = createWorld();
    const parent = world.spawn();
    const expected = createQuery(Position, ChildOf(parent));
    yield () => createQuery(Position, ChildOf(parent));
    assert.equal(createQuery(ChildOf(parent), Position), expected);
    world.destroy();
  });

  bench('wildcard target', function* () {
    const expected = createQuery(Position, ChildOf('*'));
    yield () => createQuery(Position, ChildOf('*'));
    assert.equal(createQuery(ChildOf('*'), Position), expected);
  });

  bench('cached target query', function* () {
    const target = createQuery(IsPlayer, IsActive);
    const expected = createQuery(Position, ChildOf(target));
    yield () => createQuery(Position, ChildOf(target));
    assert.equal(createQuery(Position, ChildOf(IsActive, IsPlayer)), expected);
  });

  bench('named relation target', function* () {
    const expected = createQuery(Position, ChildOf(Name('player')));
    yield () => createQuery(Position, ChildOf(Name('player')));
    assert.equal(createQuery(ChildOf(Name('player')), Position), expected);
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
group('world.query inline cache hit @query @query-api @query-hash', () => {
  bench('name + trait + Not', function* () {
    const world = createWorld();
    const player = world.spawn(Name('player'), Position);
    world.spawn(Name('enemy'), Position);
    assert.deepEqual(Array.from(world.query(Name('player'), Position, Not(IsActive))), [player]);
    yield () => world.query(Name('player'), Position, Not(IsActive));
    assert.deepEqual(Array.from(world.query(Name('player'), Position, Not(IsActive))), [player]);
    world.destroy();
  });

  bench('1 trait', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(Position)), [entity]);

    yield () => world.query(Position);

    world.destroy();
  });

  bench('2 traits', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(Position, Velocity)), [entity]);

    yield () => world.query(Position, Velocity);

    world.destroy();
  });

  bench('2 traits + Not', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(Position, Velocity, Not(IsPlayer))), [entity]);

    yield () => world.query(Position, Velocity, Not(IsPlayer));

    world.destroy();
  });

  bench('3 traits', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(Position, Velocity, Health)), [entity]);

    yield () => world.query(Position, Velocity, Health);

    assert.deepEqual(Array.from(world.query(Position, Velocity, Health)), [entity]);
    world.destroy();
  });
});

group('world.query inline relation cache hit @query @query-api @query-hash @relation-hash', () => {
  bench('concrete target', function* () {
    const world = createWorld();
    const parent = world.spawn();
    const entity = world.spawn(Position, ChildOf(parent));
    world.spawn(Position, ChildOf(world.spawn()));
    assert.deepEqual(Array.from(world.query(Position, ChildOf(parent))), [entity]);
    yield () => world.query(Position, ChildOf(parent));
    assert.deepEqual(Array.from(world.query(Position, ChildOf(parent))), [entity]);
    world.destroy();
  });

  bench('wildcard target', function* () {
    const { world, entity } = setupWorld();
    assert.deepEqual(Array.from(world.query(Position, ChildOf('*'))), [entity]);
    yield () => world.query(Position, ChildOf('*'));
    world.destroy();
  });

  bench('cached target query', function* () {
    const { world, entity } = setupWorld();
    const target = createQuery(IsPlayer);
    assert.deepEqual(Array.from(world.query(Position, ChildOf(target))), [entity]);
    yield () => world.query(Position, ChildOf(target));
    assert.deepEqual(Array.from(world.query(Position, ChildOf(target))), [entity]);
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

// The cached Query ref is the ceiling the inline path is chasing. Same world, same results,
// the only difference is that hashing and the hash lookup are replaced by an id index.
group('world.query cached ref @query @query-api', () => {
  bench('1 trait', function* () {
    const { world, entity } = setupWorld();
    const query = createQuery(Position);
    assert.deepEqual(Array.from(world.query(query)), [entity]);

    yield () => world.query(query);

    world.destroy();
  });

  bench('2 traits', function* () {
    const { world, entity } = setupWorld();
    const query = createQuery(Position, Velocity);
    assert.deepEqual(Array.from(world.query(query)), [entity]);

    yield () => world.query(query);

    world.destroy();
  });

  bench('2 traits + Not', function* () {
    const { world, entity } = setupWorld();
    const query = createQuery(Position, Velocity, Not(IsPlayer));
    assert.deepEqual(Array.from(world.query(query)), [entity]);

    yield () => world.query(query);

    world.destroy();
  });

  bench('3 traits', function* () {
    const { world, entity } = setupWorld();
    const query = createQuery(Position, Velocity, Health);
    assert.deepEqual(Array.from(world.query(query)), [entity]);

    yield () => world.query(query);

    world.destroy();
  });

  bench('relation target filter', function* () {
    const { world, entity } = setupWorld();
    const query = createQuery(Position, ChildOf(IsPlayer));
    assert.deepEqual(Array.from(world.query(query)), [entity]);

    yield () => world.query(query);

    world.destroy();
  });

  bench('nested relation target filter', function* () {
    const { world, entity } = setupWorld();
    const query = createQuery(Position, ChildOf(IsPlayer, ChildOf(IsActive)));
    assert.deepEqual(Array.from(world.query(query)), [entity]);

    yield () => world.query(query);

    world.destroy();
  });
});
