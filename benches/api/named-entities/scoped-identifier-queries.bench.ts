import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, identifier, relation, trait, type Entity } from 'koota';

function createScene(scoped = true) {
  const ChildOf = relation({ exclusive: true });
  const Name = identifier(scoped ? { scope: ChildOf } : { exclusive: false });
  const RobotId = identifier<number>();
  const Position = trait({ x: 0 });
  const world = createWorld();
  const arms: { entity: Entity; root: Entity; parking: Entity; name: string }[] = [];
  const paths: {
    robot: number;
    arm: string;
    part: string;
    parent: Entity;
    entity: Entity;
  }[] = [];

  for (let r = 0; r < 32; r++) {
    const root = world.spawn(RobotId(r));
    const parking = world.spawn();
    for (let a = 0; a < 4; a++) {
      const name = `arm-${a}`;
      const arm = world.spawn(ChildOf(root), Name(name));
      arms.push({ entity: arm, root, parking, name });
      for (let p = 0; p < 8; p++) {
        const part = `part-${p}`;
        const entity = world.spawn(ChildOf(arm), Name(part), Position);
        paths.push({ robot: r, arm: name, part, parent: arm, entity });
      }
    }
  }

  return { world, ChildOf, Name, RobotId, Position, arms, paths };
}

group('scoped query reads 1024 @identifier-scope-query @identifier @query', () => {
  for (const path of [false, true]) {
    for (const mode of ['lookup and has', 'inline query', 'cached query', 'cached queryFirst']) {
      bench(`${path ? 'three keys' : 'known parent'} / ${mode}`, function* () {
        const { world, ChildOf, Name, RobotId, Position, paths } = createScene();
        let read: (i: number) => Entity | undefined;

        if (mode === 'lookup and has') {
          read = path
            ? (i) => {
                const request = paths[i];
                const entity = world.lookup(
                  RobotId(request.robot),
                  Name(request.arm),
                  Name(request.part)
                );
                return entity?.has(Position) ? entity : undefined;
              }
            : (i) => {
                const entity = world.lookup(paths[i].parent, Name(paths[i].part));
                return entity?.has(Position) ? entity : undefined;
              };
        } else if (mode === 'inline query') {
          read = path
            ? (i) => {
                const request = paths[i];
                return world
                  .query(
                    Name(request.part),
                    ChildOf(Name(request.arm), ChildOf(RobotId(request.robot))),
                    Position
                  )
                  .at(0);
              }
            : (i) => world.query(Name(paths[i].part), ChildOf(paths[i].parent), Position).at(0);
        } else {
          const queries = paths.map((request) =>
            createQuery(
              Name(request.part),
              path
                ? ChildOf(Name(request.arm), ChildOf(RobotId(request.robot)))
                : ChildOf(request.parent),
              Position
            )
          );
          read =
            mode === 'cached query'
              ? (i) => world.query(queries[i]).at(0)
              : (i) => world.queryFirst(queries[i]);
        }

        // Register and validate every query before measuring steady reads.
        for (let i = 0; i < paths.length; i++) assert.equal(read(i), paths[i].entity);
        const count = yield () => {
          let count = 0;
          for (let i = 0; i < paths.length; i++) if (read(i) === paths[i].entity) count++;
          return count;
        };
        assert.equal(count, 1024);
        world.destroy();
        return count;
      });
    }
  }
});

for (const scoped of [true, false]) {
  group(
    `${scoped ? 'scoped' : 'shared-name'} query maintenance 256 ${scoped ? '@identifier-scope-query' : '@identifier-query-reparent'} @identifier @query`,
    () => {
      for (const operation of ['rename parent', 'move parent']) {
        for (const count of [0, 1, 128, 1024]) {
          bench(`${operation} / ${count} cached paths`, function* () {
            const { world, ChildOf, Name, RobotId, Position, arms, paths } = createScene(scoped);
            const observed =
              count === 128 ? paths.filter((_, i) => i % 8 === 0) : paths.slice(0, count);
            const queries = observed.map((request) =>
              createQuery(
                Name(request.part),
                ChildOf(Name(request.arm), ChildOf(RobotId(request.robot))),
                Position
              )
            );
            for (let i = 0; i < queries.length; i++) {
              assert.deepEqual(world.query(queries[i]).toArray(), [observed[i].entity]);
            }
            const change = (matching: boolean) => {
              for (const arm of arms) {
                if (operation === 'rename parent')
                  arm.entity.add(Name(matching ? arm.name : `other-${arm.name}`));
                else arm.entity.add(ChildOf(matching ? arm.root : arm.parking));
              }
            };
            change(false);
            for (const query of queries) assert.equal(world.query(query).length, 0);
            change(true);

            yield {
              bench: () => {
                // Every sample includes leaving and re-entering the cached result sets.
                change(false);
                change(true);
              },
              snapshot: () => {
                for (const arm of arms) {
                  assert.equal(arm.entity.targetFor(Name), arm.name);
                  assert.equal(arm.entity.targetFor(ChildOf), arm.root);
                }
                for (let i = 0; i < queries.length; i++) {
                  assert.deepEqual(world.query(queries[i]).toArray(), [observed[i].entity]);
                }
                return arms.length * 2;
              },
            };
            world.destroy();
          });
        }
      }
    }
  );
}
