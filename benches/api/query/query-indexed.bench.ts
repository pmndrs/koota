import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

group('indexed query iteration 10000 @query-indexed', () => {
  for (const mode of [
    'array for of',
    'array indexed',
    'array forEach',
    'query for of',
    'query indexed',
    'query forEach',
    'copy then indexed',
    'query entities indexed',
    'query entities for of',
    'sorted entities indexed',
    'sorted entities for of',
  ]) {
    bench(
      `${mode}${['array indexed', 'array for of', 'query entities indexed', 'query entities for of'].includes(mode) ? ' @query-indexed-raw' : ''}${['array indexed', 'array for of', 'sorted entities indexed', 'sorted entities for of'].includes(mode) ? ' @sorted-indexed-raw' : ''}`,
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
          case 'array forEach':
            walk = () => {
              let result = 0;
              entities.forEach((entity) => {
                result = (result + entity) | 0;
              });
              sum = result;
            };
            break;
          case 'query for of':
            walk = () => {
              let result = 0;
              for (const entity of query) result = (result + entity) | 0;
              sum = result;
            };
            break;
          case 'query indexed':
            walk = () => {
              let result = 0;
              for (let i = 0, length = query.length; i < length; i++) {
                result = (result + query.at(i)!) | 0;
              }
              sum = result;
            };
            break;
          case 'query forEach':
            walk = () => {
              let result = 0;
              query.forEach((entity) => {
                result = (result + entity) | 0;
              });
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
          default:
            walk = () => {
              const snapshot = query.toArray();
              let result = 0;
              for (let i = 0, length = snapshot.length; i < length; i++) {
                result = (result + snapshot[i]) | 0;
              }
              sum = result;
            };
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
