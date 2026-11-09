import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity, type SortKeySelector } from 'koota';

group('sortBy @sort-by', () => {
  for (const [count, workload] of [
    [480, 'churn'],
    [480, 'single write'],
    [480, 'all writes'],
    [480, 'clean'],
    [10_000, 'churn'],
  ] as const) {
    bench(`${count} ${workload}`, function* () {
      const world = createWorld();
      const Value = trait({ key: 0, x: 0, y: 0, z: 0 });
      let serial = 0;
      const spawn = () => world.spawn(Value({ key: ((serial++ * 7919) % 100_000) / 10 }));
      for (let i = 0; i < count; i++) spawn();
      const query = world.query(Value);
      const selector: SortKeySelector<typeof Value> = (value) => value.key;
      const view = query.sortBy(Value, selector);
      const first = query.first!;
      let result = view.entities;
      let random = 42;
      yield {
        bench: () => {
          if (workload === 'churn') {
            world.query(Value).first!.destroy();
            spawn();
          } else if (workload === 'single write') {
            first.set(Value, { key: ((serial++ * 7919) % 100_000) / 10 });
          } else if (workload === 'all writes') {
            query.each((value) => {
              random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
              value.key = random / 10;
            });
          }
          result = query.sortBy(Value, selector).entities;
        },
        snapshot: () => {
          assert.equal(result.length, count);
          assert.equal(new Set(result).size, count);
          let previous = -Infinity;
          for (const entity of result) {
            const key = selector(entity.get(Value)!);
            assert.equal(key >= previous, true);
            previous = key;
          }
          return result.length;
        },
      };
      world.destroy();
    });
  }

  bench('480 churn entity comparator', function* () {
    const world = createWorld();
    const Value = trait({ key: 0, x: 0, y: 0, z: 0 });
    let serial = 0;
    const spawn = () => world.spawn(Value({ key: ((serial++ * 7919) % 100_000) / 10 }));
    for (let i = 0; i < 480; i++) spawn();
    const query = world.query(Value);
    const record = Value.record();
    const compare = (a: Entity, b: Entity) => a.get(Value, record)!.key - b.get(Value, record)!.key;
    let result = query.sort(compare, [Value]).entities;
    yield {
      bench: () => {
        world.query(Value).first!.destroy();
        spawn();
        result = query.sort(compare, [Value]).entities;
      },
      snapshot: () => {
        assert.equal(result.length, 480);
        assert.equal(new Set(result).size, 480);
        let previous = -Infinity;
        for (const entity of result) {
          const key = entity.get(Value)!.key;
          assert.equal(key >= previous, true);
          previous = key;
        }
        return result.length;
      },
    };
    world.destroy();
  });
});
