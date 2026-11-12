import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

for (const [count, layout] of [
  [2, 'soa'],
  [8, 'mixed'],
] as const) {
  group(`${count} ${layout} trait accessors 10k @query @trait @accessor @query-accessor`, () => {
    for (const mode of ['read', 'update'] as const) {
      bench(`each ${mode}`, function* () {
        const traits = Array.from({ length: count }, (_, i) =>
          layout === 'mixed' && i % 2 ? trait(() => ({ value: 0 })) : trait({ value: 0 })
        );
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) {
          world.spawn(...traits.map((trait) => trait({ value: i })));
        }
        const query = world.query(...traits);
        const args = traits.map((_, i) => `t${i}`);
        const values = args.map((arg) => (mode === 'read' ? `${arg}.value` : `++${arg}.value`));
        // Compile one positional parameter per trait, since a rest parameter allocates per entity.
        // oxlint-disable-next-line typescript/no-implied-eval -- The trait count sets the arity.
        const run = new Function(
          'query',
          `return function run() {
            let sum = 0;
            query.each(function callback(${args.join(', ')}) {
              sum += ${values.join(' + ')};
            });
            return sum;
          };`
        )(query) as () => number;

        yield {
          bench: run,
          snapshot: () => {
            const expected = query.first!.get(traits[0])!;
            for (const trait of traits) {
              assert.equal(query.first!.get(trait), expected);
              assert.equal(query.at(9999)!.get(trait), { value: expected.value + 9999 });
            }
            return query.length * traits.length;
          },
        };
        world.destroy();
      });
    }
  });
}
