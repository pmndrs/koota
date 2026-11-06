import { assert, bench, group } from '@pmndrs/labs';
import { trait } from 'koota';
import { createWorld } from 'koota/entity-methods';

group('indexed query iteration 10000 @query-indexed', () => {
  for (const mode of [
    'array for of',
    'array indexed',
    'query entities indexed',
    'query entities for of',
    'sorted entities indexed',
    'sorted entities for of',
  ] as const) {
    bench(
      `${mode}${mode.startsWith('sorted') ? ' @sorted-indexed-raw' : mode.startsWith('query') ? ' @query-indexed-raw' : ' @query-indexed-raw @sorted-indexed-raw'}`,
      function* () {
        const world = createWorld();
        const Included = trait();
        for (let i = 0; i < 10_000; i++) world.spawn(Included);
        const query = world.query(Included);
        const entities = query.toArray();
        const expected = entities.reduce((sum, entity) => (sum + entity) | 0, 0);
        let sum = 0;
        let walk: () => void;
        switch (mode) {
          case 'array for of':
            walk = () => {
              let result = 0;
              for (const entity of entities) result = (result + entity) | 0;
              sum = result;
            };
            break;
          case 'array indexed':
            walk = () => {
              let result = 0;
              for (let i = 0, length = entities.length; i < length; i++) {
                result = (result + entities[i]) | 0;
              }
              sum = result;
            };
            break;
          case 'query entities indexed':
            walk = () => {
              const entities = query.entities;
              let result = 0;
              for (let i = 0, length = entities.length; i < length; i++) {
                result = (result + entities[i]) | 0;
              }
              sum = result;
            };
            break;
          case 'query entities for of':
            walk = () => {
              const entities = query.entities;
              let result = 0;
              for (const entity of entities) result = (result + entity) | 0;
              sum = result;
            };
            break;
          case 'sorted entities indexed':
          case 'sorted entities for of': {
            const sorted = query.sort((a, b) => a - b, [Included]);
            // Build the order before measuring cached access and traversal.
            assert.equal(sorted.entities.length, 10_000);
            walk =
              mode === 'sorted entities indexed'
                ? () => {
                    const entities = sorted.entities;
                    let result = 0;
                    for (let i = 0, length = entities.length; i < length; i++) {
                      result = (result + entities[i]) | 0;
                    }
                    sum = result;
                  }
                : () => {
                    const entities = sorted.entities;
                    let result = 0;
                    for (const entity of entities) result = (result + entity) | 0;
                    sum = result;
                  };
            break;
          }
        }
        yield {
          bench: walk,
          snapshot: () => {
            assert.equal(sum, expected);
            return sum;
          },
        };
        world.destroy();
      }
    );
  }
});
