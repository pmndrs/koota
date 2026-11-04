import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity } from 'koota';

for (const count of [32, 1024, 10_000, 100_000]) {
  group(`entity array fill ${count} @entity-array-allocation`, () => {
    for (const mode of ['new Array', 'Array.from'] as const) {
      bench(mode, function* () {
        const world = createWorld();
        const Included = trait();
        for (let i = 0; i < count; i++) world.spawn(Included);
        const entities = world.query(Included).toArray();
        const allocate =
          mode === 'new Array'
            ? (length: number) => new Array<Entity>(length)
            : (length: number) => Array.from<Entity>({ length });
        let result: Entity[] = [];
        yield {
          bench: () => {
            const next = allocate(entities.length);
            for (let i = 0; i < entities.length; i++) next[i] = entities[i];
            result = next;
          },
          snapshot: () => {
            assert.equal(result, entities);
            return result.length;
          },
        };
        world.destroy();
      });
    }
  });

  group(`query layout rebuild ${count} @query-layout-allocation`, () => {
    bench('getPages after membership change', function* () {
      const world = createWorld();
      const Position = trait({ x: 0 });
      const Included = trait();
      for (let i = 0; i < count; i++) world.spawn(Position({ x: i }), Included);
      const query = world.query(Position, Included);
      const entities = query.toArray();
      const last = entities.at(-1)!;
      let pages = query.getPages();
      yield {
        bench: () => {
          // Rebuild the layout while preserving membership and order for the snapshot.
          last.remove(Included);
          last.add(Included);
          pages = query.getPages();
        },
        snapshot: () => {
          assert.equal(
            pages.flatMap((page) => page.entities),
            entities
          );
          return pages.reduce((total, page) => total + page.entities.length, 0);
        },
      };
      world.destroy();
    });
  });
}
