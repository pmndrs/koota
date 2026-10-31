import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

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

    for (const tracked of [false, true]) {
      bench(`query.updateEach ${tracked ? 'tracked' : 'untracked'}`, function* () {
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) world.spawn(Position);
        const query = world.query(Position);
        let notifications = 0;
        if (tracked) world.onChange(Position, () => notifications++);

        yield {
          bench: () => {
            query.updateEach(([position]) => position.x++);
          },
          snapshot: () => {
            const x = query.first!.get(Position)!.x;
            assert.equal(query.at(9999)!.get(Position), { x, y: 0, z: 0 });
            if (tracked) assert.equal(notifications, x * query.length);
            return query.length;
          },
        };
        world.destroy();
      });
    }
  });
}

group('set variants 10k @trait @accessor @set', () => {
  const Position = trait({ x: 0, y: 0, z: 0 });

  for (const mode of ['callback', 'subscribed', 'partial'] as const) {
    bench(`entity.set ${mode}`, function* () {
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Position));
      let frame = 0;
      let notifications = 0;
      if (mode === 'subscribed') world.onChange(Position, () => notifications++);

      yield {
        bench: () => {
          frame++;
          notifications = 0;
          for (let i = 0; i < entities.length; i++) {
            if (mode === 'callback') {
              entities[i].set(Position, (position) => ({
                x: position.x + 1,
                y: position.y + 1,
                z: position.z + 1,
              }));
            } else if (mode === 'partial') {
              entities[i].set(Position, { x: frame });
            } else {
              entities[i].set(Position, { x: frame, y: frame, z: frame });
            }
          }
        },
        snapshot: () => {
          const full = mode !== 'partial';
          assert.equal(entities[9999].get(Position), {
            x: frame,
            y: full ? frame : 0,
            z: full ? frame : 0,
          });
          if (mode === 'subscribed') assert.equal(notifications, entities.length);
          return entities.length;
        },
      };

      world.destroy();
    });
  }
});
