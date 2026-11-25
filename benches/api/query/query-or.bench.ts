import { assert, bench, group } from '@pmndrs/labs';
import { createChanged, createQuery, createWorld, Not, Or, trait } from 'koota';

group('or query maintenance 10k @query-or', () => {
  bench('trait or not', function* () {
    const world = createWorld();
    const U = trait();
    const V = trait();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(V));
    const query = createQuery(Or(U, Not(V)));
    assert.equal(world.query(query).length, 0);

    yield {
      bench: () => {
        for (const entity of entities) entity.remove(V);
        return world.query(query).length;
      },
      snapshot: () => {
        assert.equal(world.query(query).length, entities.length);
        return entities.length;
      },
      after: () => {
        for (const entity of entities) entity.add(V);
      },
    };

    world.destroy();
  });
});

group('mixed tracking or 10k persistent @query-or', () => {
  bench('consume persistent matches and 100 changes', function* () {
    const world = createWorld();
    const T = trait({ value: 0 });
    const U = trait();
    const Changed = createChanged();
    for (let i = 0; i < 10_000; i++) world.spawn(U);
    const tracked = Array.from({ length: 100 }, () => world.spawn(T));
    const query = createQuery(Or(Changed(T), U));
    assert.equal(world.query(query).length, 10_100);
    assert.equal(world.query(query).length, 10_000);

    const result = yield () => {
      for (const entity of tracked) entity.changed(T);
      return world.query(query).length;
    };

    assert.equal(result, 10_100);
    world.destroy();
  });
});
