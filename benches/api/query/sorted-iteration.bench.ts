import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, getStore, trait, type Entity } from 'koota';

for (const count of [32, 10_000, 100_000]) {
  group(`sorted data traversal ${count} @sorted-iteration-data`, () => {
    for (const mode of [
      'query each',
      'sorted each cached',
      'sorted each dependency',
      'sorted each untracked',
      'sorted forEach',
      'sorted for of',
      'sorted array stores',
    ] as const) {
      bench(`${mode}${mode.startsWith('sorted for') ? ' @sorted-entity-reads' : ''}`, function* () {
        const world = createWorld();
        const Position = trait({ x: 0 });
        const Velocity = trait({ x: 0 });
        for (let i = 0; i < count; i++) {
          // Permute keys so sorted traversal crosses storage pages.
          const x = (i * 8191) % count;
          world.spawn(Position({ x }), Velocity({ x }));
        }
        const query = world.query(Position, Velocity);
        const compare = (a: Entity, b: Entity) => a.get(Position)!.x - b.get(Position)!.x;
        const sorted = query.sort(compare, mode === 'sorted each untracked' ? [] : [Position]);
        const view =
          mode === 'query each'
            ? query.select(Velocity)
            : sorted.select(mode === 'sorted each dependency' ? Position : Velocity);
        const entities = sorted.toArray();
        const store = getStore(world, Velocity);
        let sum = 0;
        const walk =
          mode === 'sorted array stores'
            ? () => {
                let result = 0;
                for (const entity of entities) {
                  const id = entity.id();
                  result = (result + store.x[id >>> 10][id & 1023]) | 0;
                }
                sum = result;
              }
            : mode === 'sorted forEach'
              ? () => {
                  let result = 0;
                  sorted.forEach((entity) => {
                    result = (result + entity.get(Position)!.x) | 0;
                  });
                  sum = result;
                }
              : mode === 'sorted for of'
                ? () => {
                    let result = 0;
                    for (const entity of sorted) result = (result + entity.get(Position)!.x) | 0;
                    sum = result;
                  }
                : () => {
                    let result = 0;
                    view.each((value) => {
                      result = (result + value.x) | 0;
                    });
                    sum = result;
                  };
        yield {
          bench: walk,
          snapshot: () => {
            assert.equal(sum, ((count * (count - 1)) / 2) | 0);
            assert.equal(entities.length, count);
            assert.equal(entities[0].get(Position)!.x, 0);
            assert.equal(entities.at(-1)!.get(Position)!.x, count - 1);
            return [count, sum];
          },
        };
        world.destroy();
      });
    }
  });
}
