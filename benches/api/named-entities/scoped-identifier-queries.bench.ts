import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, identifier, relation, trait, type Entity } from 'koota';

function createScene() {
  const ChildOf = relation({ exclusive: true });
  const Name = identifier({ scope: ChildOf });
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
  for (const mode of [
    'known parent / lookup and has',
    'known parent / cached query',
    'three keys / cached query',
  ]) {
    bench(mode, function* () {
      const { world, ChildOf, Name, RobotId, Position, paths } = createScene();
      let read: (i: number) => Entity | undefined;

      if (mode === 'known parent / lookup and has') {
        read = (i) => {
          const entity = world.lookup(paths[i].parent, Name(paths[i].part));
          return entity?.has(Position) ? entity : undefined;
        };
      } else {
        const queries = paths.map((request) =>
          createQuery(
            Name(request.part),
            mode === 'three keys / cached query'
              ? ChildOf(Name(request.arm), ChildOf(RobotId(request.robot)))
              : ChildOf(request.parent),
            Position
          )
        );
        read = (i) => world.query(queries[i]).at(0);
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
});

group('scoped query maintenance 256 @identifier-scope-query @identifier @query', () => {
  for (const [operation, count] of [
    ['move parent', 0],
    ['move parent', 1024],
    ['rename parent', 1024],
  ] as const) {
    bench(`${operation} / ${count} cached paths`, function* () {
      const { world, ChildOf, Name, RobotId, Position, arms, paths } = createScene();
      const observed = paths.slice(0, count);
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
});
