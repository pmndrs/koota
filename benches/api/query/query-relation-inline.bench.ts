import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createWorld, relation, trait, type Entity } from 'koota';
import { warmWalks } from '../../warm-walks';

// One relation covers each policy, three exercise projection scaling and scattered pages.
for (const [exclusive, count, targetCount, modes] of [
  [true, 1, 1, ['unused', 'selected', 'consumed']],
  [false, 1, 2, ['unused', 'consumed']],
  [true, 3, 1, ['unused']],
  [false, 3, 2, ['consumed']],
  [false, 1, 32, ['unused']],
] as const) {
  group(
    `inline ${exclusive ? 'exclusive' : 'multiple'} ${count} relations ${targetCount} targets 10k @relation-each-inline`,
    () => {
      for (const mode of modes) {
        bench(mode, function* () {
          warmWalks();
          const world = createWorld();
          const Position = trait({ x: 0 });
          // The walk sums into this trait, as a system would. It starts at a fraction so its
          // column holds floats from the first write.
          const Total = trait({ value: 0.5 });
          const relations = Array.from({ length: count }, () => relation({ exclusive }));
          const targets = Array.from({ length: targetCount }, () => world.spawn());
          const entities: Entity[] = [];
          for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn());
            if (count === 3) for (let gap = 0; gap < 3; gap++) world.spawn();
          }
          // The last entity to get its traits, whose total the checks read.
          let probe = entities[0];
          for (let i = 0; i < 10_000; i++) {
            const entity = entities[count === 3 ? (i * 7919) % 10_000 : i];
            probe = entity;
            entity.add(Position({ x: i }), Total);
            for (const relation of relations) {
              for (const target of targets) entity.add(relation(target));
            }
          }

          // Detect the callback shape through a different binding from the measured walk.
          let projected = false;
          world.query(relations[0]('*')).each((...args: unknown[]) => {
            projected = args.length === 3;
          });
          const frames = { count: 0 };
          const parameters = relations.map((_, i) => `relations[${i}]('*')`);
          const args = [
            'position',
            'total',
            ...(projected && mode !== 'selected' ? relations.map((_, i) => `target${i}`) : []),
            'entity',
          ];
          const reads =
            mode === 'consumed'
              ? relations
                  .map((_, i) => {
                    const target = projected
                      ? `target${i}`
                      : `entity.${exclusive ? 'targetFor' : 'targetsFor'}(relations[${i}])`;
                    return `var t${i} = ${target}; total.value += ${exclusive ? `t${i}` : `t${i}.length + t${i}[0] + t${i}[1]`};`;
                  })
                  .join('\n')
              : '';
          // Compile literal query arguments and an inline callback before timing.
          const run = new Function(
            'world',
            'Position',
            'Total',
            'relations',
            'frames',
            `return function run() {
              frames.count++;
              world.query(Position, Total, ${parameters.join(', ')})${mode === 'selected' ? '.select(Position, Total)' : ''}
                .each(function callback(${args.join(', ')}) {
                  total.value += position.x;
                  ${reads}
                });
            };`
          )(world, Position, Total, relations, frames) as () => void;
          // What one walk adds to the total of the probed entity, which holds x 9999.
          const step =
            9999 +
            (mode === 'consumed'
              ? count * (exclusive ? targets[0] : targets.length + targets[0] + targets[1])
              : 0);
          run();
          assert.equal(probe.get(Total)!.value, 0.5 + step);
          yield {
            bench: run,
            snapshot: () => {
              assert.equal(probe.get(Total)!.value, 0.5 + step * frames.count);
              return 10_000;
            },
          };
          world.destroy();
        });
      }
    }
  );
}

group('inline plain trait 10k @relation-each-inline', () => {
  bench('no relations', function* () {
    warmWalks();
    const world = createWorld();
    const Position = trait({ x: 0 });
    // The walks sum into this trait, as a system would. It starts at a fraction so its column
    // holds floats from the first write.
    const Total = trait({ value: 0.5 });
    for (let i = 0; i < 10_000; i++) world.spawn(Position({ x: i }), Total);
    let frames = 0;
    yield {
      bench: () => {
        frames++;
        world.query(Position, Total).each((position, total) => {
          total.value += position.x;
        });
      },
      snapshot: () => {
        const last = world.query(Position, Total).at(9999)!;
        assert.equal(last.get(Total)!.value, 0.5 + 9999 * frames);
        return 10_000;
      },
    };
    world.destroy();
  });
});

group('owned relation selection 10k @relation-each-inline', () => {
  bench('repeated concrete lookup and target selection', function* () {
    warmWalks();
    const world = createWorld();
    const Parent = relation({ exclusive: true });
    const Contains = relation();
    const parent = world.spawn();
    const item = world.spawn();
    for (let i = 0; i < 10_000; i++) world.spawn(Parent(parent), Contains(item));
    let projected = false;
    world.query(Contains('*')).each((...args: unknown[]) => {
      projected = args.length === 3;
    });
    // The walk records each target by its entity's place in the list. A total kept in a variable
    // outside the callback would make every step wait on the one before it and hide the walk.
    const seen: number[] = Array.from({ length: 10_000 }, () => 0);
    const consume = projected
      ? (value: Entity | readonly Entity[], _entity: Entity, i: number) => {
          seen[i] = (value as readonly Entity[])[0];
        }
      : (value: Entity | readonly Entity[], i: number) => {
          seen[i] = (value as Entity).targetsFor(Contains)[0];
        };
    yield {
      bench: () => {
        world.query(Parent(parent)).select(Contains('*')).each(consume);
      },
      snapshot: () => {
        const sum = seen.reduce((sum, target) => sum + target, 0);
        assert.equal(sum, item * 10_000);
        return sum;
      },
    };
    world.destroy();
  });
});
