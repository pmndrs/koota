import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, getStore, ordered, relation, trait, type Entity } from 'koota';

const Position = trait({ x: 0 });
const Velocity = trait({ x: 1 });

group('ordered view cache hit @ordered-view-cache', () => {
  bench('tracked sort', function* () {
    const world = createWorld();
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
  for (const mode of ['array', 'sorted', 'relation'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const ChildOf = relation();
      const Children = ordered(ChildOf);
      const parent = world.spawn(Children);
      for (let i = 0; i < 10_000; i++) {
        world.spawn(Position({ x: i }), Velocity, ...(mode === 'relation' ? [ChildOf(parent)] : []));
      }
      const store = getStore(world, Position);
      const compare = (a: Entity, b: Entity) => {
        const left = a.id();
        const right = b.id();
        return store.x[left >>> 10][left & 1023] - store.x[right >>> 10][right & 1023];
      };
      const query = world.query(Position);
      const view = mode === 'relation' ? parent.get(Children)! : query.sort(compare, [Position]);
      let sum = 0;
      yield {
        bench: () => {
          sum = 0;
          const entities = mode === 'array' ? query.toArray().sort(compare) : view;
          for (const entity of entities) sum += entity.id();
        },
        snapshot: () => {
          assert.equal(
            sum,
            query.toArray().reduce((total, entity) => total + entity.id(), 0)
          );
          return query.length;
        },
      };
      world.destroy();
    });
  }
});

group('ordered trait access 10k @ordered-view', () => {
  for (const mode of ['query', 'sorted', 'relation'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const ChildOf = relation();
      const Children = ordered(ChildOf);
      const parent = world.spawn(Children);
      for (let i = 0; i < 10_000; i++) {
        world.spawn(Position({ x: i }), Velocity, ...(mode === 'relation' ? [ChildOf(parent)] : []));
      }
      const query = world.query(Position, Velocity);
      const selected =
        mode === 'query'
          ? query.select(Velocity)
          : mode === 'relation'
            ? parent.get(Children)!.select(Velocity)
            : query.sort((a, b) => b.id() - a.id(), [Position]).select(Velocity);
      let sum = 0;
      yield {
        bench: () => {
          sum = 0;
          selected.each((velocity) => {
            sum += velocity.x;
          });
        },
        snapshot: () => {
          assert.equal(sum, 10_000);
          return sum;
        },
      };
      world.destroy();
    });
  }
});

/** Includes publishing a fresh order, rather than only walking a clean cache. */
group('ordered refresh 10k @ordered-refresh', () => {
  for (const mode of ['clean', 'sort each walk', 'membership each walk'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const Included = trait();
      for (let i = 0; i < 10_000; i++) world.spawn(Included);
      const query = world.query(Included);
      const last = query.at(-1)!;
      const view = query.sort((a, b) => a - b, [Included]);
      const total = query.toArray().reduce((sum, entity) => (sum + entity) | 0, 0);
      let included = true;
      let sum = 0;
      yield {
        bench: () => {
          if (mode === 'sort each walk') view.invalidate();
          if (mode === 'membership each walk') {
            if (included) last.remove(Included);
            else last.add(Included);
            included = !included;
          }
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
