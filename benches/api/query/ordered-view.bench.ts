import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, ordered, relation, trait, type Entity } from 'koota';
import { warmWalks } from '../../warm-walks';

group('ordered view cache hit @ordered-view-cache', () => {
  bench('tracked sort', function* () {
    const world = createWorld();
    const Position = trait({ x: 0 });
    world.spawn(Position);
    const query = world.query(Position);
    const compare = (a: Entity, b: Entity) => a.get(Position)!.x - b.get(Position)!.x;
    const expected = query.sort(compare, [Position]);
    let view = expected;
    yield {
      bench: () => {
        view = query.sort(compare, [Position]);
      },
      snapshot: () => {
        assert.equal(view === expected, true);
        return view.length;
      },
    };
    world.destroy();
  });
});

group('ordered traversal 10k @ordered-view', () => {
  for (const mode of ['array', 'query', 'sorted', 'relation'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const Included = trait();
      const ChildOf = relation();
      const Children = ordered(ChildOf);
      const parent = world.spawn(Children);
      for (let i = 0; i < 10_000; i++) {
        world.spawn(Included, ...(mode === 'relation' ? [ChildOf(parent)] : []));
      }
      const query = world.query(Included);
      const entities = query.toArray();
      const expected = entities.reduce((sum, entity) => (sum + entity) | 0, 0);
      const view =
        mode === 'array'
          ? entities
          : mode === 'query'
            ? query
            : mode === 'relation'
              ? parent.get(Children)!
              : query.sort((a, b) => a - b, [Included]);
      // Complete the initial sort before measuring cached traversal.
      assert.equal(view.length, 10_000);
      let sum = 0;
      yield {
        bench: () => {
          let result = 0;
          for (const entity of view) result = (result + entity) | 0;
          sum = result;
        },
        snapshot: () => {
          assert.equal(sum, expected);
          return sum;
        },
      };
      world.destroy();
    });
  }
});

group('ordered trait access 10k @ordered-view', () => {
  for (const mode of [
    'query',
    'sorted',
    'sorted dependency',
    'sorted untracked',
    'relation',
  ] as const) {
    bench(mode, function* () {
      warmWalks();
      const world = createWorld();
      const Position = trait({ x: 0 });
      const Velocity = trait({ x: 0 });
      // The walks sum into this trait, as a system would. It starts at a fraction so its column
      // holds floats from the first write.
      const Total = trait({ value: 0.5 });
      const ChildOf = relation();
      const Children = ordered(ChildOf);
      const parent = world.spawn(Children);
      let probe = parent;
      let probed = 0;
      for (let i = 0; i < 10_000; i++) {
        // Permute sort keys so ordered reads cross storage pages.
        const x = (i * 8191) % 10_000;
        probed = x;
        probe = world.spawn(
          Position({ x }),
          Velocity({ x }),
          Total,
          ...(mode === 'relation' ? [ChildOf(parent)] : [])
        );
      }
      const query = world.query(Position, Velocity, Total);
      const selected =
        mode === 'query'
          ? query.select(Velocity, Total)
          : mode === 'relation'
            ? parent.get(Children)!.select(Velocity, Total)
            : query
                .sort(
                  (a, b) => a.get(Position)!.x - b.get(Position)!.x,
                  mode === 'sorted untracked' ? [] : [Position]
                )
                .select(mode === 'sorted dependency' ? Position : Velocity, Total);
      assert.equal(selected.length, 10_000);
      let frames = 0;
      yield {
        bench: () => {
          frames++;
          selected.each((value, total) => {
            total.value += value.x;
          });
        },
        snapshot: () => {
          assert.equal(probe.get(Total), { value: 0.5 + probed * frames });
          return selected.length;
        },
      };
      world.destroy();
    });
  }
});

group('ordered refresh 10k @ordered-refresh @ordered-rebuild', () => {
  for (const mode of ['membership each walk', 'membership after guarded removal'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const Included = trait();
      for (let i = 0; i < 10_000; i++) world.spawn(Included);
      const query = world.query(Included);
      const last = query.at(-1)!;
      if (mode === 'membership after guarded removal') {
        query.forEach((entity) => {
          if (entity === last) entity.remove(Included);
        });
        world.query(Included);
        last.add(Included);
      }
      const view = query.sort((a, b) => a - b, [Included]);
      const total = query.toArray().reduce((sum, entity) => (sum + entity) | 0, 0);
      let included = true;
      let sum = 0;
      yield {
        bench: () => {
          if (included) last.remove(Included);
          else last.add(Included);
          included = !included;
          let result = 0;
          for (const entity of view) result = (result + entity) | 0;
          sum = result;
        },
        snapshot: () => {
          assert.equal(sum, included ? total : (total - last) | 0);
          return 10_000;
        },
      };
      world.destroy();
    });
  }
});
