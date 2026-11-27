import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity, type SortKeySelector } from 'koota';
import { warmWalks } from '../../warm-walks';

group('sortBy each @sort-by @sort-by-each', () => {
  for (const count of [100, 400]) {
    for (const refresh of [true, false]) {
      bench(`${count} different projection ${refresh ? 'refresh' : 'cached'}`, function* () {
        warmWalks();
        const world = createWorld();
        const Revision = trait({ current: 0 });
        const Tile = trait({ z: 18, x: 0, y: 0, width: 1, height: 1 });
        // The walk sums into this trait, as a system would. It starts at a fraction so its
        // column holds floats from the first write.
        const Total = trait({ value: 0.5 });
        for (let i = 0; i < count; i++) world.spawn(Revision, Tile, Total);
        const query = world.query(Tile, Total);
        const first = query.first!;
        const view = query.sortBy(Revision, (revision) => revision.current);
        let frames = 1;
        const visit = (tile: { z: number }, total: { value: number }) => {
          total.value += tile.z;
        };
        view.each(visit);
        yield {
          bench: () => {
            // One same-value write invalidates all keys without measuring a full write pass.
            if (refresh) first.set(Revision, { current: 1 });
            frames++;
            view.each(visit);
          },
          snapshot: () => {
            assert.equal(first.get(Total), { value: 0.5 + 18 * frames });
            return count;
          },
        };
        world.destroy();
      });
    }
  }
});

group('sortBy @sort-by', () => {
  for (const [count, workload] of [
    [480, 'churn'],
    [480, 'single write'],
    [480, 'all writes'],
    [480, 'clean'],
    [10_000, 'churn'],
  ] as const) {
    bench(`${count} ${workload}`, function* () {
      warmWalks();
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
