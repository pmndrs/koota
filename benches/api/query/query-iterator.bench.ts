import { assert, bench, group } from '@pmndrs/labs';
import { createQuery, createWorld, trait } from 'koota';

for (const count of [32, 10_000, 100_000]) {
  group(`query iteration ${count} @query-iterator`, () => {
    for (const mode of [
      'array',
      'query cached',
      'query run',
      'query membership',
      'membership only',
    ] as const) {
      bench(
        `${mode}${mode === 'array' || mode === 'query cached' || mode === 'query run' ? ' @query-iterator-read' : ' @query-iterator-write'}`,
        function* () {
          const world = createWorld();
          const Included = trait();
          for (let i = 0; i < count; i++) world.spawn(Included);
          const ref = createQuery(Included);
          const query = world.query(ref);
          const entities = query.toArray();
          const last = entities.at(-1)!;
          const total = entities.reduce((sum, entity) => (sum + entity) | 0, 0);
          let included = true;
          let sum = 0;
          const walk =
            mode === 'array'
              ? () => {
                  let result = 0;
                  for (const entity of entities) result = (result + entity) | 0;
                  sum = result;
                }
              : mode === 'query cached'
                ? () => {
                    let result = 0;
                    for (const entity of query) result = (result + entity) | 0;
                    sum = result;
                  }
                : mode === 'query run'
                  ? () => {
                      let result = 0;
                      for (const entity of world.query(Included)) result = (result + entity) | 0;
                      sum = result;
                    }
                  : mode === 'query membership'
                    ? () => {
                        if (included) last.remove(Included);
                        else last.add(Included);
                        included = !included;
                        let result = 0;
                        for (const entity of world.query(ref)) result = (result + entity) | 0;
                        sum = result;
                      }
                    : () => {
                        if (included) last.remove(Included);
                        else last.add(Included);
                        included = !included;
                        sum = world.query(ref).length;
                      };
          yield {
            bench: walk,
            snapshot: () => {
              const expected = included ? total : (total - last) | 0;
              assert.equal(sum, mode === 'membership only' ? count - Number(!included) : expected);
              return [count, sum];
            },
          };
          world.destroy();
        }
      );
    }
  });
}
