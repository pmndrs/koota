import { bench, group } from '@pmndrs/labs';
import { createWorld, type Entity, Not, Or, trait } from 'koota';

const traits = Array.from({ length: 16 }, () => trait({ v: 0 }));
const [A, B, C, D, E] = traits;
const tags = Array.from({ length: 3000 }, () => trait());

const combos = () => {
  const out: any[][] = [];
  for (let i = 0; i < 16 && out.length < 100; i++)
    for (let j = i + 1; j < 16 && out.length < 100; j++) out.push([traits[i], traits[j]]);
  for (let i = 0; i < 16 && out.length < 200; i++)
    for (let j = 0; j < 16 && out.length < 200; j++) {
      if (i !== j) out.push([traits[i], Not(traits[j])]);
    }
  return out;
};

group('query creation @query-create', () => {
  bench('qc 200 distinct queries then spawn 2k', function* () {
    const world = createWorld();
    const qs = combos();
    yield () => {
      for (const q of qs) world.query(...q);
      for (let i = 0; i < 2000; i++) world.spawn(traits[i % 16], traits[(i * 7) % 16]);
    };
    world.destroy();
  });

  bench('qc 200 queries then add/remove trait on 2k', function* () {
    const world = createWorld();
    for (const q of combos()) world.query(...q);
    const ents: Entity[] = [];
    for (let i = 0; i < 2000; i++) ents.push(world.spawn(A));
    yield () => {
      for (let i = 0; i < ents.length; i++) ents[i].add(B);
      for (let i = 0; i < ents.length; i++) ents[i].remove(B);
    };
    world.destroy();
  });

  bench('qc Not/Or queries add/remove on 2k', function* () {
    const world = createWorld();
    for (let i = 0; i < 20; i++) {
      world.query(A, Not(traits[1 + (i % 15)]));
      world.query(Or(B, traits[(i + 2) % 16]), Not(C));
    }
    world.query(A, Not(B, C), Or(D, E));
    const ents: Entity[] = [];
    for (let i = 0; i < 2000; i++) ents.push(world.spawn(A));
    yield () => {
      for (let i = 0; i < ents.length; i++) ents[i].add(B, D);
      for (let i = 0; i < ents.length; i++) ents[i].remove(B, D);
    };
    world.destroy();
  });

  bench('qc initial population 20k, new Not query', function* () {
    const world = createWorld();
    for (let i = 0; i < 20_000; i++) {
      if (i % 100 === 0) world.spawn(A, B);
      else if (i % 2 === 0) world.spawn(C);
      else world.spawn(D);
    }
    let k = 0;
    yield () => world.query(A, B, Not(tags[k++ % tags.length])).length;
    world.destroy();
  });

  bench('qc initial population 20k, new Or query', function* () {
    const world = createWorld();
    for (let i = 0; i < 20_000; i++) {
      if (i % 100 === 0) world.spawn(A, B);
      else if (i % 2 === 0) world.spawn(C);
      else world.spawn(D);
    }
    let k = 0;
    yield () => world.query(A, Or(B, tags[k++ % tags.length])).length;
    world.destroy();
  });
});
