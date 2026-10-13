import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

for (const kind of ['tag', 'data'] as const) {
  for (const queryCount of [0, 8, 32]) {
    for (const recycled of [false, true]) {
      group(
        `${kind} add/remove ${queryCount} queries 10k${recycled ? ' recycled' : ''} @trait-add`,
        () => {
          bench(`toggle ${kind} q${queryCount}${recycled ? ' recycled' : ''}`, function* () {
            const world = createWorld();
            const Toggled = kind === 'tag' ? trait() : trait({ x: 0, y: 0 });
            const Other = trait();
            const Extra = Array.from({ length: queryCount }, () => trait());
            for (let i = 0; i < queryCount; i++) {
              if (i % 2 === 0) world.query(Toggled, Extra[i]);
              else world.query(Toggled, Other);
            }
            if (recycled) {
              for (const e of Array.from({ length: 10_000 }, () => world.spawn())) e.destroy();
            }
            const entities = Array.from({ length: 10_000 }, () => world.spawn(Other, ...Extra));

            yield {
              bench: () => {
                for (let i = 0; i < entities.length; i++) entities[i].add(Toggled);
                for (let i = 0; i < entities.length; i++) entities[i].remove(Toggled);
              },
              snapshot: () => {
                assert.equal(entities[0].has(Toggled), false);
                return entities.length;
              },
            };
            world.destroy();
          });
        }
      );
    }
  }
}
