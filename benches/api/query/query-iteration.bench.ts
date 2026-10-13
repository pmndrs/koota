import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

for (const count of [2, 8]) {
  for (const layout of ['soa', 'mixed'] as const) {
    group(`${count} ${layout} trait accessors 10k @query @trait @accessor @query-accessor`, () => {
      for (const mode of ['readEach', 'updateEach'] as const) {
        bench(mode, function* () {
          const traits = Array.from({ length: count }, (_, i) =>
            layout === 'mixed' && i % 2 ? trait(() => ({ value: 0 })) : trait({ value: 0 })
          );
          const world = createWorld();
          for (let i = 0; i < 10_000; i++) {
            world.spawn(...traits.map((trait) => trait({ value: i })));
          }
          const query = world.query(...traits);

          yield {
            bench: () => {
              let sum = 0;
              if (mode === 'readEach') {
                query.readEach((state: { value: number }[]) => {
                  for (let i = 0; i < state.length; i++) sum += state[i].value;
                });
              } else {
                query.updateEach((state: { value: number }[]) => {
                  for (let i = 0; i < state.length; i++) sum += ++state[i].value;
                });
              }
              return sum;
            },
            snapshot: () => {
              const expected = query[0].get(traits[0])!;
              for (const trait of traits) {
                assert.equal(query[0].get(trait), expected);
                assert.equal(query[9999].get(trait), { value: expected.value + 9999 });
              }
              return query.length * traits.length;
            },
          };
          world.destroy();
        });
      }
    });
  }
}
