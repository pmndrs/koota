import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait } from 'koota';

group('add a tag to 10k entities @query-transitions', () => {
  for (const [queryCount, shapes] of [
    [0, 1],
    [1, 1],
    [9, 1],
    [9, 512],
  ]) {
    bench(`affected queries = ${queryCount}, trait combinations = ${shapes}`, function* () {
      const world = createWorld();
      const Active = trait();
      const flags = Array.from({ length: 9 }, () => trait());
      const queries = flags.slice(0, queryCount).map((flag) => createQuery(Active, flag));
      for (const query of queries) world.query(query);

      const expected = Array<number>(queryCount).fill(0);
      const entities = Array.from({ length: 10_000 }, (_, i) => {
        const mask = shapes === 1 ? 3 : i % shapes;
        for (let bit = 0; bit < queryCount; bit++) if (mask & (1 << bit)) expected[bit]++;
        return world.spawn(...flags.filter((_, bit) => mask & (1 << bit)));
      });

      yield {
        bench: () => {
          for (const entity of entities) entity.add(Active);
        },
        snapshot: () => {
          const counts = queries.map((query) => world.query(query).length);
          assert.equal(counts, expected);
          return counts;
        },
        after: () => {
          for (const entity of entities) entity.remove(Active);
        },
      };

      world.destroy();
    });
  }
});
