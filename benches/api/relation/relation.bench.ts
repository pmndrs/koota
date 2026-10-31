import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, relation, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const IsPlayer = trait();
const IsActive = trait();

group('relation mutations 10k @relation @mutation', () => {
  bench('relation add + remove', function* () {
    const Link = relation();
    const world = createWorld();
    const target = world.spawn();
    const pair = Link(target);
    const sources = Array.from({ length: 10_000 }, () => world.spawn());

    yield {
      bench: () => {
        for (let i = 0; i < sources.length; i++) {
          sources[i].add(pair);
          sources[i].remove(pair);
        }
      },
      snapshot: () => {
        assert.equal(sources[9999].has(pair), false);
        assert.equal(world.query(Link('*')).length, 0);
        return sources.length;
      },
    };
    world.destroy();
  });

  for (const mode of ['value', 'callback'] as const) {
    bench(mode === 'value' ? 'relation set' : 'relation set callback', function* () {
      const Link = relation({ store: { weight: 0 } });
      const world = createWorld();
      const target = world.spawn();
      const pair = Link(target);
      const sources = Array.from({ length: 10_000 }, () => world.spawn(pair));
      let frame = 0;

      yield {
        bench: () => {
          frame ^= 1;
          for (let i = 0; i < sources.length; i++) {
            sources[i].set(
              pair,
              mode === 'callback'
                ? (previous) => ({ weight: previous.weight ^ 1 })
                : { weight: frame }
            );
          }
        },
        snapshot: () => {
          assert.equal(sources[9999].get(pair), { weight: frame });
          return sources.length;
        },
      };
      world.destroy();
    });
  }
});

group('relation queries 10k @relation', () => {
  const ChildOf = relation();

  bench('1 parent query ChildOf(parent)', function* () {
    const world = createWorld();
    const parent = world.spawn(Position);
    for (let i = 0; i < 10_000; i++) {
      world.spawn(Position, ChildOf(parent));
    }

    const result = yield () => world.query(ChildOf(parent));

    world.destroy();
    return result.length;
  });

  bench('100 parents, ChildOf(*)', function* () {
    const world = createWorld();
    const parents: Entity[] = [];
    for (let i = 0; i < 100; i++) {
      parents.push(world.spawn(Position));
    }
    for (let i = 0; i < 10_000; i++) {
      world.spawn(Position, ChildOf(parents[i % 100]));
    }

    const result = yield () => world.query(ChildOf('*'));

    world.destroy();
    return result.length;
  });

  bench('100 parents, ChildOf(parent)', function* () {
    const world = createWorld();
    const parents: Entity[] = [];
    for (let i = 0; i < 100; i++) {
      parents.push(world.spawn(Position));
    }
    for (let i = 0; i < 10_000; i++) {
      world.spawn(Position, ChildOf(parents[i % 100]));
    }

    const queryTarget = parents[0];
    const result = yield () => world.query(ChildOf(queryTarget));

    world.destroy();
    return result.length;
  });
});

group('relation target filters 10k @relation @query', () => {
  const ChildOf = relation();

  const buildWorld = () => {
    const world = createWorld();
    const parents: Entity[] = [];

    for (let i = 0; i < 100; i++) {
      const traits: any[] = [Position];
      if (i % 2 === 0) traits.push(IsPlayer);
      if (i % 4 === 0) traits.push(IsActive);
      parents.push(world.spawn(...traits));
    }

    for (let i = 0; i < 10_000; i++) {
      world.spawn(Position, ChildOf(parents[i % parents.length]));
    }

    return { world, parents };
  };

  bench('100 parents, query ChildOf(IsPlayer)', function* () {
    const { world } = buildWorld();
    const result = yield () => world.query(ChildOf(IsPlayer));
    world.destroy();
    return result.length;
  });

  bench('100 parents, manual ChildOf(*) filter IsPlayer', function* () {
    const { world } = buildWorld();
    const result = yield () => {
      let count = 0;
      for (const child of world.query(ChildOf('*'))) {
        if (child.targetFor(ChildOf)?.has(IsPlayer)) count++;
      }
      return count;
    };
    world.destroy();
    return result;
  });

  bench('toggle 200 parents with ChildOf(IsPlayer) active', function* () {
    const world = createWorld();
    const parents: Entity[] = [];

    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) parents.push(world.spawn(Position, IsPlayer));
      else parents.push(world.spawn(Position));
    }

    for (let i = 0; i < 2_000; i++) {
      world.spawn(Position, ChildOf(parents[i % parents.length]));
    }

    world.query(ChildOf(IsPlayer));

    let enabled = true;
    yield {
      bench: () => {
        enabled = !enabled;
        for (let i = 0; i < parents.length; i++) {
          if ((i % 2 === 0) === enabled) parents[i].add(IsPlayer);
          else parents[i].remove(IsPlayer);
        }
      },
      snapshot: () => {
        const matches = world.query(ChildOf(IsPlayer));
        let hasFirst = false;
        let hasSecond = false;
        for (const child of matches) {
          const parent = child.targetFor(ChildOf);
          if (parent === parents[0]) hasFirst = true;
          if (parent === parents[1]) hasSecond = true;
        }
        return [matches.length, hasFirst, hasSecond];
      },
    };

    world.destroy();
  });
});

group('relation target lifecycle 1k @relation @lifecycle', () => {
  bench('spawn after 100 destroyed targets', function* () {
    const ChildOf = relation({ autoDestroy: 'orphan' });
    const Mesh = trait();
    const world = createWorld();

    // Distinct targets keep handle reuse from capping the number of cached queries.
    const targets = Array.from({ length: 100 }, () => world.spawn());
    for (const target of targets) {
      world.spawn(Mesh, ChildOf(target));
      world.query(Mesh, ChildOf(target));
      target.destroy();
    }

    const root = world.spawn();
    const pair = ChildOf(root);
    world.spawn(Mesh, pair).destroy();
    world.query(Mesh, pair);
    const entities: Entity[] = [];

    yield {
      bench: () => {
        for (let i = 0; i < 1000; i++) entities[i] = world.spawn(Mesh, pair);
      },
      snapshot: () => {
        const count = world.query(Mesh, pair).length;
        assert.equal(count, 1000);
        return count;
      },
      after: () => {
        for (const entity of entities) entity.destroy();
        world.query(Mesh, pair);
      },
    };

    world.destroy();
  });

  bench('destroy queried targets among 100 unrelated queries', function* () {
    const ChildOf = relation();
    const Mesh = trait();
    const world = createWorld();
    world.query(Mesh, ChildOf('*'));

    const targets = Array.from({ length: 100 }, () => world.spawn());
    for (const target of targets) world.query(createQuery(Mesh, ChildOf(target)));

    const entities: Entity[] = [];
    const spawn = () => {
      for (let i = 0; i < 1000; i++) {
        const entity = world.spawn();
        entities[i] = entity;
        world.query(Mesh, ChildOf(entity));
      }
    };
    spawn();

    yield {
      bench: () => {
        for (const entity of entities) entity.destroy();
      },
      snapshot: () => {
        assert.equal(
          entities.every((entity) => !world.has(entity)),
          true
        );
        const count = world.entities.length;
        assert.equal(count, targets.length + 1);
        return count;
      },
      after: spawn,
    };

    world.destroy();
  });
});

group('relation data 10k @relation @accessor', () => {
  const Attached = relation({ store: { offset: [0, 0, 0], weight: 1 } });

  bench('relation get', function* () {
    const world = createWorld();
    const pair = Attached(world.spawn());
    const children = Array.from({ length: 10_000 }, () => world.spawn(pair));
    const sum = yield () => {
      let sum = 0;
      for (let i = 0; i < children.length; i++) sum += children[i].get(pair)!.weight;
      return sum;
    };
    assert.equal(sum, 10_000);
    world.destroy();
  });
});
