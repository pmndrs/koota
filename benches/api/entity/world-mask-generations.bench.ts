import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

// A static isolated import disables entity method types throughout the benchmark suite.
const { createWorld: createIsolatedWorld }: { createWorld: typeof createWorld } = await import(
  'koota/isolated' as string
);

group('destroy across worlds 10k @entity @mask-generations', () => {
  bench('destroy one-tag entities after another world used 310 traits', function* () {
    const world = createWorld();
    const Tag = trait();
    const entities = Array.from({ length: 10_000 }, () => world.spawn(Tag));
    const other = createWorld();
    other.spawn(...Array.from({ length: 310 }, () => trait()));
    other.destroy();

    yield {
      bench: () => {
        for (let i = 0; i < entities.length; i++) entities[i].destroy();
      },
      snapshot: () => {
        assert.equal(world.entities.length, 1);
        return entities.length;
      },
      after: () => {
        for (let i = 0; i < entities.length; i++) entities[i] = world.spawn(Tag);
      },
    };

    world.destroy();
  });
});

group('world reset across mask generations @mask-reset', () => {
  for (const [name, create] of [
    ['shared', createWorld],
    ['isolated', createIsolatedWorld],
  ] as const) {
    bench(`populate and reset a world with 310 traits (${name})`, function* () {
      const world = create();
      const tags = Array.from({ length: 310 }, () => trait());

      yield {
        bench: () => {
          world.spawn(...tags);
          for (let i = 0; i < 4096; i++) world.spawn(tags[i % tags.length]);
          world.reset();
        },
        snapshot: () => {
          assert.equal(world.entities.length, 1);
          return world.entities.length;
        },
      };

      world.destroy();
    });
  }
});

group('queried trait mutations 10k @mask-layout', () => {
  for (const reset of [false, true]) {
    bench(`add and remove with 8 queries in a ${reset ? 'reset' : 'fresh'} world`, function* () {
      const world = createWorld();
      const tags = Array.from({ length: 31 }, () => trait());
      if (reset) {
        world.spawn(...tags);
        world.reset();
      }
      world.spawn(...tags);
      const entities = Array.from({ length: 10_000 }, (_, i) => world.spawn(tags[1 + (i % 8)]));
      const tag = tags[0];
      const views = tags.slice(1, 9).map((other) => world.query(tag, other));

      yield {
        bench: () => {
          for (const entity of entities) {
            entity.add(tag);
            entity.remove(tag);
          }
        },
        snapshot: () => {
          for (const view of views) assert.equal(view.length, 1);
          return entities.length;
        },
      };

      world.destroy();
    });
  }
});

group('rebuild shared mask tables @mask-rebuild', () => {
  bench('populate and reset a one-page world after releasing 512 pages', function* () {
    const previous = Array.from({ length: 512 }, () => createWorld());
    for (const world of previous.reverse()) world.destroy();
    const world = createWorld();
    const tags = Array.from({ length: 310 }, () => trait());

    yield {
      bench: () => {
        world.spawn(...tags);
        world.reset();
      },
      snapshot: () => world.entities.length,
    };

    world.destroy();
  });
});
