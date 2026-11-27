import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';
import { warmWalks } from '../../warm-walks';

for (const [count, layout] of [
  [2, 'soa'],
  [8, 'mixed'],
] as const) {
  group(`${count} ${layout} trait accessors 10k @query @trait @accessor @query-accessor`, () => {
    for (const mode of ['read', 'update', 'tracked read', 'tracked update'] as const) {
      bench(`each ${mode}`, function* () {
        warmWalks();
        const traits = Array.from({ length: count }, (_, i) =>
          layout === 'mixed' && i % 2 ? trait(() => ({ value: 0 })) : trait({ value: 0 })
        );
        // The walks sum into this trait, as a system would. It starts at a fraction so its column
        // holds floats from the first write.
        const Total = trait({ value: 0.5 });
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) {
          world.spawn(...traits.map((trait) => trait({ value: i })), Total);
        }
        if (mode.startsWith('tracked')) world.onChange(traits[0], () => {});
        const query = world.query(...traits, Total);
        const args = traits.map((_, i) => `t${i}`);
        const values = args.map((arg) => (mode.endsWith('read') ? `${arg}.value` : `++${arg}.value`));
        // Compile one positional parameter per trait, since a rest parameter allocates per entity.
        const run = new Function(
          'query',
          `return function run() {
            query.each(function callback(${[...args, 'total'].join(', ')}) {
              total.value += ${values.join(' + ')};
            });
          };`
        )(query) as () => void;

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
    warmWalks();
    const Position = trait({ x: 1, y: 0, z: 0 });
    const Velocity = trait({ x: 2, y: 0, z: 0 });
    // The walks sum into this trait, as a system would. It starts at a fraction so its column
    // holds floats from the first write.
    const Total = trait({ value: 0.5 });
    const world = createWorld();
    for (let i = 0; i < 100; i++) world.spawn(Velocity, Position, Total);
    const moving = world.query(Velocity, Position, Total);
    const positions = moving.select(Position, Total);
    let frames = 0;

    yield {
      bench: () => {
        frames++;
        moving.each((velocity, position, total) => {
          total.value += velocity.x + position.x;
        });
        positions.each((position, total) => {
          total.value += position.x;
        });
      },
      snapshot: () => {
        assert.equal(moving.at(99)!.get(Total), { value: 0.5 + 4 * frames });
        return moving.length;
      },
    };
    world.destroy();
  });
});
