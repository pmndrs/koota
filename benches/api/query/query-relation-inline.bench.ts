import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createWorld, relation, trait, type Entity } from 'koota';

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
          const world = createWorld();
          const Position = trait({ x: 0 });
          const relations = Array.from({ length: count }, () => relation({ exclusive }));
          const targets = Array.from({ length: targetCount }, () => world.spawn());
          const entities: Entity[] = [];
          for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn());
            if (count === 3) for (let gap = 0; gap < 3; gap++) world.spawn();
          }
          for (let i = 0; i < 10_000; i++) {
            const entity = entities[count === 3 ? (i * 7919) % 10_000 : i];
            entity.add(Position({ x: i }));
            for (const relation of relations) {
              for (const target of targets) entity.add(relation(target));
            }
          }

          // Detect the callback shape through a different binding from the measured walk.
          let projected = false;
          world.query(relations[0]('*')).each((...args: unknown[]) => {
            projected = args.length === 3;
          });
          const sink = { value: 0 };
          const parameters = relations.map((_, i) => `relations[${i}]('*')`);
          const args = [
            'position',
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
                    return `var t${i} = ${target}; sink.value += ${exclusive ? `t${i}` : `t${i}.length + t${i}[0] + t${i}[1]`};`;
                  })
                  .join('\n')
              : '';
          // Compile literal query arguments and an inline callback before timing.
          // oxlint-disable-next-line typescript/no-implied-eval -- Generates the old or new API shape.
          const run = new Function(
            'world',
            'Position',
            'relations',
            'sink',
            `return function run() {
              sink.value = 0;
              world.query(Position, ${parameters.join(', ')})${mode === 'selected' ? '.select(Position)' : ''}
                .each(function callback(${args.join(', ')}) {
                  sink.value += position.x;
                  ${reads}
                });
              return sink.value;
            };`
          )(world, Position, relations, sink);
          const expected =
            49_995_000 +
            (mode === 'consumed'
              ? 10_000 * count * (exclusive ? targets[0] : targets.length + targets[0] + targets[1])
              : 0);
          assert.equal(run(), expected);
          const result = yield run;
          assert.equal(result, expected);
          world.destroy();
        });
      }
    }
  );
}

group('inline plain trait 10k @relation-each-inline', () => {
  bench('no relations', function* () {
    const world = createWorld();
    const Position = trait({ x: 0 });
    for (let i = 0; i < 10_000; i++) world.spawn(Position({ x: i }));
    const result = yield () => {
      let sum = 0;
      world.query(Position).each((position) => {
        sum += position.x;
      });
      return sum;
    };
    assert.equal(result, 49_995_000);
    world.destroy();
  });
});

group('owned relation selection 10k @relation-each-inline', () => {
  bench('repeated concrete lookup and target selection', function* () {
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
    let sum = 0;
    const consume = projected
      ? (value: Entity | readonly Entity[]) => {
          sum += (value as readonly Entity[])[0];
        }
      : (value: Entity | readonly Entity[]) => {
          sum += (value as Entity).targetsFor(Contains)[0];
        };
    const result = yield () => {
      sum = 0;
      world.query(Parent(parent)).select(Contains('*')).each(consume);
      return sum;
    };
    assert.equal(result, item * 10_000);
    world.destroy();
  });
});
