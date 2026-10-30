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
}

group('iterator cache selection @query @query-iterator-cache', () => {
  for (const count of [2, 8]) {
    bench(`${count} traits`, function* () {
      const traits = Array.from({ length: count }, (_, value) => trait({ value }));
      const world = createWorld();
      world.spawn(...traits);
      const forward = world.query(...traits);
      const reverse = world.query(...traits.toReversed());
      let sum = 0;
      const read = (state: { value: number }[]) => {
        for (let i = 0; i < state.length; i++) sum += state[i].value * (i + 1);
      };

      yield {
        bench: () => {
          sum = 0;
          forward.readEach(read);
          reverse.readEach(read);
          return sum;
        },
        snapshot: () => {
          assert.equal(sum, ((count - 1) * count * (count + 1)) / 2);
          return sum;
        },
      };
      world.destroy();
    });
  }
});

group('tuple iteration 10k @query @tuple @iteration-allocation', () => {
  const Position = trait({ value: [0, 0, 0] });

  for (const mode of ['readEach', 'auto', 'always', 'never'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      for (let i = 0; i < 10_000; i++) world.spawn(Position({ value: [i, 0, 0] }));
      const query = world.query(Position);
      let notifications = 0;
      if (mode === 'auto') world.onChange(Position, () => notifications++);

      yield {
        bench: () => {
          let sum = 0;
          if (mode === 'readEach') {
            query.readEach(([position]) => (sum += position.value[0]));
          } else {
            query.updateEach(([position]) => (sum += ++position.value[0]), {
              changeDetection: mode,
            });
          }
          return sum;
        },
        snapshot: () => {
          const x = query.first!.get(Position)!.value[0];
          assert.equal(query.at(9999)!.get(Position)!.value, [x + 9999, 0, 0]);
          if (mode === 'auto') assert.equal(notifications, x * query.length);
          return query.length;
        },
      };
      world.destroy();
    });
  }
});

group('tracked atomic iteration 10k @query @iteration-allocation', () => {
  const Position = trait(() => ({ x: 0, y: 0 }));

  for (const changeDetection of ['auto', 'always'] as const) {
    bench(changeDetection, function* () {
      const world = createWorld();
      for (let i = 0; i < 10_000; i++) world.spawn(Position);
      const query = world.query(Position);
      let notifications = 0;
      world.onChange(Position, () => notifications++);

      yield {
        bench: () => query.updateEach(([position]) => position.x++, { changeDetection }),
        snapshot: () => {
          const x = query.first!.get(Position)!.x;
          assert.equal(query.at(9999)!.get(Position), { x, y: 0 });
          assert.equal(notifications, x * query.length);
          return query.length;
        },
      };
      world.destroy();
    });
  }
});

for (const layout of ['soa', 'aos'] as const) {
  group(`${layout} floating-point iteration 10k @query @iteration-float`, () => {
    const Position =
      layout === 'soa' ? trait({ x: 0.5, y: 0.25 }) : trait(() => ({ x: 0.5, y: 0.25 }));

    for (const mode of ['readEach', 'updateEach'] as const) {
      bench(mode, function* () {
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) world.spawn(Position);
        const query = world.query(Position);
        let notifications = 0;
        if (mode === 'updateEach') world.onChange(Position, () => notifications++);
        const sum = new Float64Array(1);

        yield {
          bench: () => {
            sum[0] = 0;
            query[mode](([position]) => {
              if (mode === 'updateEach') {
                position.x += 0.5;
                position.y += 0.25;
              }
              sum[0] += position.x + position.y;
            });
            return sum[0];
          },
          snapshot: () => {
            const x = query.first!.get(Position)!.x;
            assert.equal(query.at(9999)!.get(Position), { x, y: x * 0.5 });
            if (mode === 'updateEach') {
              assert.equal(notifications, (x - 0.5) * 2 * query.length);
            }
            return query.length;
          },
        };
        world.destroy();
      });
    }
  });
}
