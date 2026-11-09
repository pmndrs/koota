import { assert, bench, group } from '@pmndrs/labs';
import { trait } from 'koota';
import { createWorld } from 'koota/entity-methods';

for (const [count, layout] of [
  [2, 'soa'],
  [8, 'mixed'],
] as const) {
  group(`${count} ${layout} trait accessors 10k @query @trait @accessor @query-accessor`, () => {
    for (const mode of ['read', 'update', 'tracked read', 'tracked update'] as const) {
      bench(`each ${mode}`, function* () {
        const traits = Array.from({ length: count }, (_, i) =>
          layout === 'mixed' && i % 2 ? trait(() => ({ value: 0 })) : trait({ value: 0 })
        );
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) {
          world.spawn(...traits.map((trait) => trait({ value: i })));
        }
        if (mode.startsWith('tracked')) world.onChange(traits[0], () => {});
        const query = world.query(...traits);
        const args = traits.map((_, i) => `t${i}`);
        const values = args.map((arg) => (mode.endsWith('read') ? `${arg}.value` : `++${arg}.value`));
        // Compile one positional parameter per trait, since a rest parameter allocates per entity.
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

group('alternating query selections 100 entities @query @query-selection', () => {
  bench('walk both traits then select one', function* () {
    const Position = trait({ x: 1, y: 0, z: 0 });
    const Velocity = trait({ x: 2, y: 0, z: 0 });
    const world = createWorld();
    for (let i = 0; i < 100; i++) world.spawn(Velocity, Position);
    const moving = world.query(Velocity, Position);
    const positions = moving.select(Position);

    const result = yield () => {
      let sum = 0;
      moving.each((velocity, position) => (sum += velocity.x + position.x));
      positions.each((position) => (sum += position.x));
      return sum;
    };

    assert.equal(result, 400);
    world.destroy();
  });
});
