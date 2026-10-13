import { bench, group } from '@pmndrs/labs';
import { createWorld, type Entity, Not, Or, trait } from 'koota';

const traits = Array.from({ length: 16 }, () => trait({ v: 0 }));
const [A, B, C, D] = traits;

const combos = () => {
  const out: any[][] = [];
  for (let i = 0; i < 16 && out.length < 32; i++)
    for (let j = i + 1; j < 16 && out.length < 32; j++) out.push([traits[i], traits[j]]);
  return out;
};

group('lazy query churn and frames @lazyq', () => {
  bench('lq churn 10k add/remove, 32 queries', function* () {
    const world = createWorld();
    for (const q of combos()) world.query(...q);
    const ents: Entity[] = [];
    for (let i = 0; i < 10000; i++) ents.push(world.spawn(A));
    yield () => {
      for (let i = 0; i < ents.length; i++) ents[i].add(B);
      for (let i = 0; i < ents.length; i++) ents[i].remove(B);
    };
    world.destroy();
  });

  bench('lq churn 10k add/remove, 32 queries, 1 read', function* () {
    const world = createWorld();
    for (const q of combos()) world.query(...q);
    const ents: Entity[] = [];
    for (let i = 0; i < 10000; i++) ents.push(world.spawn(A));
    yield () => {
      for (let i = 0; i < ents.length; i++) ents[i].add(B);
      let n = world.query(A, B).length;
      for (let i = 0; i < ents.length; i++) ents[i].remove(B);
      n += world.query(A, B).length;
      return n;
    };
    world.destroy();
  });

  bench('lq hot frame: churn 1k + read 10k result every frame', function* () {
    const world = createWorld();
    const ents: Entity[] = [];
    for (let i = 0; i < 10000; i++) ents.push(world.spawn(A));
    yield () => {
      let n = 0;
      for (let f = 0; f < 20; f++) {
        for (let i = 0; i < 1000; i++) ents[i].add(B);
        n += world.query(A, Not(B)).length;
        for (let i = 0; i < 1000; i++) ents[i].remove(B);
        n += world.query(A, Not(B)).length;
      }
      return n;
    };
    world.destroy();
  });

  bench('lq hot frame: churn 1k + readEach every frame', function* () {
    const world = createWorld();
    const ents: Entity[] = [];
    for (let i = 0; i < 10000; i++) ents.push(world.spawn(A, C));
    let sum = 0;
    yield () => {
      for (let f = 0; f < 20; f++) {
        for (let i = 0; i < 1000; i++) ents[i].add(B);
        world.query(A, B).readEach(([a]) => {
          sum += a.v;
        });
        for (let i = 0; i < 1000; i++) ents[i].remove(B);
        world.query(A, B).readEach(([a]) => {
          sum += a.v;
        });
      }
      return sum;
    };
    world.destroy();
  });

  bench('lq create 60 queries on 10k world + first read', function* () {
    const world = createWorld();
    for (let i = 0; i < 10000; i++) world.spawn(traits[i % 16], traits[(i * 7) % 16]);
    const qs = combos().slice(0, 28);
    for (let i = 0; i < 16; i++) qs.push([traits[i], Not(traits[(i + 1) % 16])]);
    for (let i = 0; i < 16; i++) qs.push([Or(traits[i], traits[(i + 3) % 16])]);
    yield () => {
      let n = 0;
      for (const q of qs) n += world.query(...q).length;
      return n;
    };
    world.destroy();
  });

  bench('lq spawn 10k with 32 queries', function* () {
    const world = createWorld();
    for (const q of combos()) world.query(...q);
    let ents: Entity[] = [];
    yield () => {
      ents = [];
      for (let i = 0; i < 10000; i++)
        ents.push(world.spawn(traits[i % 16], traits[(i * 7 + 1) % 16]));
    };
    for (const e of ents) e.destroy();
    world.destroy();
  });

  bench('lq repeat read 10k result, no churn', function* () {
    const world = createWorld();
    for (let i = 0; i < 10000; i++) world.spawn(A, B, D);
    world.query(A, B);
    yield () => {
      let n = 0;
      for (let i = 0; i < 100; i++) n += world.query(A, B).length;
      return n;
    };
    world.destroy();
  });
});
