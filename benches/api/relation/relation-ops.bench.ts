import { bench, group } from '@pmndrs/labs';
import { createWorld, relation, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });

group('relation ops 10k @relops', () => {
  bench('relops add and remove target', function* () {
    const ChildOf = relation();
    const world = createWorld();
    const parent = world.spawn();
    const kids: Entity[] = [];
    for (let i = 0; i < 10_000; i++) kids.push(world.spawn(Position));
    yield {
      bench: () => {
        for (let i = 0; i < kids.length; i++) kids[i].add(ChildOf(parent));
        for (let i = 0; i < kids.length; i++) kids[i].remove(ChildOf(parent));
      },
      snapshot: () => kids.filter((k) => k.has(ChildOf(parent))).length,
    };
    world.destroy();
  });

  bench('relops set relation data', function* () {
    const Rel = relation({ store: { amount: 0 } });
    const world = createWorld();
    const parent = world.spawn();
    const kids: Entity[] = [];
    for (let i = 0; i < 10_000; i++) kids.push(world.spawn(Rel(parent)));
    let n = 0;
    yield {
      bench: () => {
        n++;
        for (let i = 0; i < kids.length; i++) kids[i].set(Rel(parent), { amount: n });
      },
      snapshot: () => kids[0].get(Rel(parent))!.amount > 0,
    };
    world.destroy();
  });

  bench('relops targetFor', function* () {
    const ChildOf = relation();
    const world = createWorld();
    const parent = world.spawn();
    const kids: Entity[] = [];
    for (let i = 0; i < 10_000; i++) kids.push(world.spawn(ChildOf(parent)));
    yield {
      bench: () => {
        let c = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].targetFor(ChildOf) === parent) c++;
        return c;
      },
      snapshot: () => kids[0].targetFor(ChildOf) === parent,
    };
    world.destroy();
  });

  bench('relops exclusive replace', function* () {
    const ChildOf = relation({ exclusive: true });
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const kids: Entity[] = [];
    for (let i = 0; i < 10_000; i++) kids.push(world.spawn(ChildOf(a)));
    let flip = false;
    yield {
      bench: () => {
        flip = !flip;
        const p = flip ? b : a;
        for (let i = 0; i < kids.length; i++) kids[i].add(ChildOf(p));
      },
      snapshot: () => kids[0].targetFor(ChildOf) === (flip ? b : a),
    };
    world.destroy();
  });
});

group('relation destroy parent @relops', () => {
  for (const [count, parents] of [
    [1, 10_000],
    [100, 100],
    [10_000, 1],
  ]) {
    bench(`relops destroy ${parents} parents x ${count} children`, function* () {
      const ChildOf = relation();
      const world = createWorld();
      yield {
        bench: () => {
          const ps: Entity[] = [];
          for (let p = 0; p < parents; p++) {
            const parent = world.spawn();
            ps.push(parent);
            for (let i = 0; i < count; i++) world.spawn(ChildOf(parent));
          }
          for (let p = 0; p < ps.length; p++) ps[p].destroy();
        },
        snapshot: () => world.query(ChildOf('*')).length,
      };
      world.destroy();
    });
  }

  bench('relops destroy parents autoDestroy source 100 x 100', function* () {
    const ChildOf = relation({ autoDestroy: 'source' });
    const world = createWorld();
    yield {
      bench: () => {
        const ps: Entity[] = [];
        for (let p = 0; p < 100; p++) {
          const parent = world.spawn();
          ps.push(parent);
          for (let i = 0; i < 100; i++) world.spawn(ChildOf(parent));
        }
        for (let p = 0; p < ps.length; p++) ps[p].destroy();
      },
      snapshot: () => world.query(ChildOf('*')).length,
    };
    world.destroy();
  });
});

group('relation destroy with 20 relation types @relops', () => {
  const rels = Array.from({ length: 20 }, (_, i) =>
    relation({ autoDestroy: i % 5 === 0 ? 'target' : i % 5 === 1 ? 'source' : undefined })
  );

  bench('relops 20 types destroy 10k leaves', function* () {
    const world = createWorld();
    const root = world.spawn();
    for (let i = 0; i < rels.length; i++) world.spawn(rels[i](root));
    yield {
      bench: () => {
        const leaves: Entity[] = [];
        for (let i = 0; i < 10_000; i++) leaves.push(world.spawn(Position));
        for (let i = 0; i < leaves.length; i++) leaves[i].destroy();
      },
      snapshot: () => world.query(Position).length,
    };
    world.destroy();
  });

  bench('relops 20 types destroy 10k parents with children', function* () {
    const world = createWorld();
    const root = world.spawn();
    for (let i = 0; i < rels.length; i++) world.spawn(rels[i](root));
    yield {
      bench: () => {
        const ps: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
          const p = world.spawn(Position);
          ps.push(p);
          world.spawn(rels[2 + (i % 3)](p));
        }
        for (let i = 0; i < ps.length; i++) ps[i].destroy();
      },
      snapshot: () => world.query(Position).length,
    };
    world.destroy();
  });
});

group('ordered relation ops @relops', () => {
  bench('relops ordered add, remove and reorder', function* () {
    const ChildOf = relation({ ordered: true });
    const world = createWorld();
    const parent = world.spawn();
    const kids: Entity[] = [];
    for (let i = 0; i < 1_000; i++) kids.push(world.spawn(ChildOf(parent)));
    yield {
      bench: () => {
        for (let i = 0; i < 200; i++) {
          const e = world.spawn(ChildOf(parent));
          e.remove(ChildOf(parent));
          e.destroy();
        }
        const order = parent.sourcesFor(ChildOf).slice().reverse();
        parent.orderSources(ChildOf, order);
      },
      snapshot: () => parent.sourcesFor(ChildOf).length,
    };
    world.destroy();
  });
});
