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
});

group('many targets single relation 10k @relation', () => {
  for (const targetCount of [10, 100, 1000]) {
    bench(`${targetCount} targets, query specific`, function* () {
      const Rel = relation();
      const world = createWorld();
      const targets: Entity[] = [];
      for (let i = 0; i < targetCount; i++) {
        targets.push(world.spawn(Position));
      }
      for (let i = 0; i < 10_000; i++) {
        world.spawn(Position, Rel(targets[i % targetCount]));
      }

      const queryTarget = targets[0];
      const result = yield () => world.query(Rel(queryTarget));

      world.destroy();
      return result.length;
    });
  }
});

group('many targets multiple relations 5k @relation', () => {
  const RelA = relation();
  const RelB = relation();
  const RelC = relation();
  const RelD = relation();
  const RelE = relation();
  const allRels = [RelA, RelB, RelC, RelD, RelE];

  bench('5 rels, 200 targets, query specific', function* () {
    const world = createWorld();
    const targets: Entity[] = [];
    for (let i = 0; i < 200; i++) {
      targets.push(world.spawn(Position));
    }
    for (let i = 0; i < 5_000; i++) {
      const rel = allRels[i % 5];
      const target = targets[i % 200];
      world.spawn(Position, rel(target));
    }

    const queryTarget = targets[0];
    const result = yield () => world.query(RelA(queryTarget));

    world.destroy();
    return result.length;
  });

  bench('5 rels, 200 targets, query wildcard*', function* () {
    const world = createWorld();
    const targets: Entity[] = [];
    for (let i = 0; i < 200; i++) {
      targets.push(world.spawn(Position));
    }
    for (let i = 0; i < 5_000; i++) {
      const rel = allRels[i % 5];
      const target = targets[i % 200];
      world.spawn(Position, rel(target));
    }

    const result = yield () => world.query(RelA('*'));

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

  bench('100 parents, query ChildOf(parent)', function* () {
    const { world, parents } = buildWorld();
    const result = yield () => world.query(ChildOf(parents[0]));
    world.destroy();
    return result.length;
  });

  bench('100 parents, query ChildOf(IsPlayer)', function* () {
    const { world } = buildWorld();
    const result = yield () => world.query(ChildOf(IsPlayer));
    world.destroy();
    return result.length;
  });

  bench('100 parents, manual ChildOf(*) filter IsPlayer', function* () {
    const { world } = buildWorld();
    const result = yield () =>
      world.query(ChildOf('*')).filter((child) => child.targetFor(ChildOf)?.has(IsPlayer));
    world.destroy();
    return result.length;
  });

  bench('100 parents, query ChildOf(IsPlayer, IsActive)', function* () {
    const { world } = buildWorld();
    const result = yield () => world.query(ChildOf(IsPlayer, IsActive));
    world.destroy();
    return result.length;
  });

  bench('100 parents, manual ChildOf(*) filter IsPlayer+IsActive', function* () {
    const { world } = buildWorld();
    const result = yield () => {
      return world.query(ChildOf('*')).filter((child) => {
        const parent = child.targetFor(ChildOf);
        return parent?.has(IsPlayer) && parent?.has(IsActive);
      });
    };
    world.destroy();
    return result.length;
  });
});

group('relation target filter maintenance 2k @relation @query @toggle', () => {
  const ChildOf = relation();

  bench('toggle parents with ChildOf(IsPlayer) active', function* () {
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
        return [
          matches.length,
          matches.some((child) => child.targetFor(ChildOf) === parents[0]),
          matches.some((child) => child.targetFor(ChildOf) === parents[1]),
        ];
      },
    };

    world.destroy();
  });
});

group('spawn after target query churn 1k @relation @graph @lifecycle @target-query-churn', () => {
  for (const targetCount of [0, 100, 1000]) {
    bench(`${targetCount} destroyed targets`, function* () {
      const ChildOf = relation({ autoDestroy: 'orphan' });
      const Mesh = trait();
      const world = createWorld();

      // Distinct targets keep handle reuse from capping the number of cached queries.
      const targets = Array.from({ length: targetCount }, () => world.spawn());
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
  }
});

group('target query cleanup 1k @relation @lifecycle @target-query-cleanup', () => {
  for (const queryCount of [0, 100, 1000]) {
    for (const queried of [false, true]) {
      bench(
        `${queryCount} unrelated queries, ${queried ? 'queried targets' : 'unqueried entities'}`,
        function* () {
          const ChildOf = relation();
          const Mesh = trait();
          const world = createWorld();
          world.query(Mesh, ChildOf('*'));

          const targets = Array.from({ length: queryCount }, () => world.spawn());
          for (const target of targets) world.query(createQuery(Mesh, ChildOf(target)));

          const entities: Entity[] = [];
          const spawn = () => {
            for (let i = 0; i < 1000; i++) {
              const entity = world.spawn();
              entities[i] = entity;
              if (queried) world.query(Mesh, ChildOf(entity));
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
              assert.equal(count, queryCount + 1);
              return count;
            },
            after: spawn,
          };

          world.destroy();
        }
      );
    }
  }
});
