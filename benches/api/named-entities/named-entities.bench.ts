import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, Name, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });

group('named scene scaling @name @scaling', () => {
  for (const count of [1_000, 10_000, 100_000]) {
    for (const nameEveryProp of [false, true]) {
      bench(
        `load ${count} props with ${nameEveryProp ? 'unique names on every prop' : 'only named landmarks'}`,
        function* () {
          const world = createWorld();

          yield {
            bench: () => {
              for (let i = 0; i < count; i++) {
                if (nameEveryProp) world.spawn(Name(`object-${i}`), Position({ x: i }));
                else world.spawn(Position({ x: i }));
              }
              world.spawn(Name('player'), Position);
              world.spawn(Name('camera'), Position({ z: 10 }));
              world.spawn(Name('exit'), Position({ x: 100 }));
            },
            snapshot: () => ({
              count: world.query(Position).length,
              named: world.query(Name).length,
              exit: world.lookup('exit')?.get(Position)?.x,
            }),
            after: () => world.reset(),
          };

          world.destroy();
        }
      );
    }

    bench(`apply ${count} position updates by stable object ID`, function* () {
      const world = createWorld();
      const updates: { id: string; x: number }[] = [];
      for (let i = 0; i < count; i++) {
        world.spawn(Name(`object-${i}`), Position);
        updates.push({ id: `object-${i}`, x: i + 1 });
      }

      yield {
        bench: () => {
          for (const update of updates) {
            world.lookup(update.id)!.set(Position, { x: update.x });
          }
        },
        snapshot: () => {
          let total = 0;
          world.query(Position).readEach(([position]) => {
            total += position.x;
          });
          return total;
        },
      };

      world.destroy();
    });
  }
});

group('named entities in a scene @name @entity', () => {
  for (const lookupEachFrame of [true, false]) {
    bench(
      `camera follows player for 60 frames using ${lookupEachFrame ? 'lookups' : 'cached entities'}`,
      function* () {
        const world = createWorld();
        for (let i = 0; i < 1_000; i++) world.spawn(Position({ x: i }));
        const player = world.spawn(Name('player'), Position);
        const camera = world.spawn(Name('camera'), Position({ z: 10 }));

        yield {
          bench: () => {
            for (let frame = 0; frame < 60; frame++) {
              player.set(Position, { x: frame });
              const target = lookupEachFrame ? world.lookup('player')! : player;
              const view = lookupEachFrame ? world.lookup('camera')! : camera;
              view.set(Position, { x: target.get(Position)!.x, z: 10 });
            }
          },
          snapshot: () => camera.get(Position),
          after: () => {
            player.set(Position, { x: 0 });
            camera.set(Position, { x: 0 });
          },
        };

        world.destroy();
      }
    );
  }

  bench('respawn the player and resolve its name', function* () {
    const world = createWorld();
    for (let i = 0; i < 1_000; i++) world.spawn(Position({ x: i }));
    world.spawn(Name('player'), Position);

    yield {
      bench: () => {
        world.lookup('player')!.destroy();
        world.spawn(Name('player'), Position({ x: 10 }));
        return world.lookup('player')!.get(Position)!.x;
      },
      snapshot: () => ({
        named: world.query(Name).length,
        position: world.lookup('player')?.get(Position),
      }),
    };

    world.destroy();
  });
});

group('named query scenarios @name @name-query', () => {
  for (const count of [1_000, 100_000]) {
    bench(`first player query after loading ${count} entities`, function* () {
      const world = createWorld();
      const load = () => {
        for (let i = 0; i < count; i++) world.spawn(Position);
        world.spawn(Name('player'), Position);
      };
      load();

      yield {
        bench: () => {
          world.query(Name('player'), Position).updateEach(([position]) => {
            position.x = 7;
          });
        },
        snapshot: () => world.lookup('player')!.get(Position)!.x,
        after: () => {
          world.reset();
          load();
        },
      };

      world.destroy();
    });

    bench(`apply 1k named query updates among ${count} entities`, function* () {
      const world = createWorld();
      for (let i = 0; i < count; i++) world.spawn(Name(`object-${i}`), Position);
      const updates = Array.from({ length: 1_000 }, (_, i) => ({
        id: `object-${i * (count / 1_000)}`,
        x: i + 1,
      }));
      // Resolve the query once so this case measures repeated use.
      world.query(Name(updates[0].id), Position);

      yield {
        bench: () => {
          for (const update of updates) {
            world.query(Name(update.id), Position).updateEach(([position]) => {
              position.x = update.x;
            });
          }
        },
        snapshot: () =>
          updates.reduce((sum, update) => sum + world.lookup(update.id)!.get(Position)!.x, 0),
      };

      world.destroy();
    });

    bench(`check an absent boss 1k times among ${count} entities`, function* () {
      const world = createWorld();
      for (let i = 0; i < count; i++) world.spawn(Position);
      world.query(Name('boss'), Position);

      const result = yield () => {
        let matches = 0;
        for (let i = 0; i < 1_000; i++) matches += world.query(Name('boss'), Position).length;
        return matches;
      };

      world.destroy();
      return result;
    });
  }
});

group('named write scenarios @name @name-write @accessor', () => {
  for (const count of [1_000, 100_000]) {
    for (const useQuery of [false, true]) {
      bench(
        `rename 1k scene objects among ${count} entities with ${useQuery ? 'updateEach' : 'set'}`,
        function* () {
          const world = createWorld();
          const Selected = trait();
          const selected: Entity[] = [];
          for (let i = 0; i < count; i++) {
            const entity = world.spawn(Name(`object-${i}`));
            if (i % (count / 1_000) === 0) {
              entity.add(Selected);
              selected.push(entity);
            }
          }
          const query = createQuery(Name, Selected);
          world.query(query);
          let prefix = '';

          yield {
            bench: () => {
              prefix = prefix ? '' : 'scene/';
              if (useQuery) {
                world.query(query).updateEach((state, _entity, i) => {
                  state[0] = `${prefix}object-${i * (count / 1_000)}`;
                });
              } else {
                for (let i = 0; i < selected.length; i++) {
                  selected[i].set(Name, `${prefix}object-${i * (count / 1_000)}`);
                }
              }
            },
            snapshot: () =>
              selected.filter(
                (entity, i) =>
                  world.lookup(`${prefix}object-${i * (count / 1_000)}`) === entity &&
                  entity.name() === `${prefix}object-${i * (count / 1_000)}`
              ).length,
          };

          world.destroy();
        }
      );
    }
  }
});
