import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, ordered, relation, trait } from 'koota';

for (const layout of ['soa', 'aos'] as const) {
  group(`${layout} traits 10k @trait @accessor`, () => {
    const Position =
      layout === 'soa' ? trait({ x: 0, y: 0, z: 0 }) : trait(() => ({ x: 0, y: 0, z: 0 }));

    bench('entity.get', function* () {
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, (_, x) =>
        world.spawn(Position({ x, y: 0, z: 0 }))
      );

      const sum = yield () => {
        let sum = 0;
        for (const entity of entities) sum += entity.get(Position)!.x;
        return sum;
      };

      assert.equal(sum, 49_995_000);
      world.destroy();
      return sum;
    });

    bench('entity.set changed', function* () {
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
      let frame = 0;

      yield {
        bench: () => {
          frame ^= 1;
          for (const entity of entities) entity.set(Position, { x: frame, y: frame, z: frame });
        },
        snapshot: () => {
          assert.equal(entities[9999].get(Position), { x: frame, y: frame, z: frame });
          return entities.length;
        },
      };
      world.destroy();
    });

    bench('spawn defaults', function* () {
      const world = createWorld();

      yield {
        bench: () => {
          for (let i = 0; i < 10_000; i++) world.spawn(Position);
        },
        snapshot: () => world.query(Position).length,
        after: () => world.reset(),
      };
      world.destroy();
    });

    bench('query.readEach', function* () {
      const world = createWorld();
      for (let x = 0; x < 10_000; x++) world.spawn(Position({ x, y: 0, z: 0 }));
      const query = world.query(Position);

      const sum = yield () => {
        let sum = 0;
        query.readEach(([position]) => (sum += position.x));
        return sum;
      };

      assert.equal(sum, 49_995_000);
      world.destroy();
      return sum;
    });

    for (const mode of ['auto untracked', 'auto tracked', 'always', 'never'] as const) {
      bench(`query.updateEach ${mode}`, function* () {
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) world.spawn(Position);
        const query = world.query(Position);
        let notifications = 0;
        if (mode === 'auto tracked') world.onChange(Position, () => notifications++);
        const options = {
          changeDetection: mode === 'always' || mode === 'never' ? mode : 'auto',
        } as const;

        yield {
          bench: () => {
            query.updateEach(([position]) => position.x++, options);
          },
          snapshot: () => {
            const x = query[0].get(Position)!.x;
            assert.equal(query[9999].get(Position), { x, y: 0, z: 0 });
            if (mode === 'auto tracked') assert.equal(notifications, x * query.length);
            return query.length;
          },
        };
        world.destroy();
      });
    }
  });
}

group('partial and unchanged writes 10k @trait @accessor', () => {
  const Position = trait({ x: 0, y: 0, z: 0 });

  for (const mode of ['partial', 'unchanged'] as const) {
    bench(`entity.set ${mode}`, function* () {
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
      let frame = 0;

      yield {
        bench: () => {
          frame ^= 1;
          for (const entity of entities) {
            entity.set(Position, mode === 'partial' ? { x: frame } : { x: 0, y: 0, z: 0 });
          }
        },
        snapshot: () => {
          assert.equal(entities[9999].get(Position), {
            x: mode === 'partial' ? frame : 0,
            y: 0,
            z: 0,
          });
          return entities.length;
        },
      };
      world.destroy();
    });
  }
});

group('ordered list accessors 10k @trait @accessor @relation', () => {
  for (const mode of ['entity.get', 'query.readEach', 'query.updateEach'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const ChildOf = relation();
      const Children = ordered(ChildOf);
      for (let i = 0; i < 10_000; i++) {
        const parent = world.spawn(Children);
        world.spawn(ChildOf(parent));
      }
      const query = world.query(Children);

      const count = yield () => {
        let count = 0;
        if (mode === 'entity.get') {
          for (const entity of query) count += entity.get(Children)!.length;
        } else if (mode === 'query.readEach') {
          query.readEach(([children]) => (count += children.length));
        } else {
          query.updateEach(([children]) => (count += children.length));
        }
        return count;
      };

      assert.equal(count, 10_000);
      world.destroy();
      return count;
    });
  }
});
