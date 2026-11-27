import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, identifier, relation, trait, type Entity } from 'koota';

group('entity.has in a loop over 10k entities @entity @has', () => {
  const tags = Array.from({ length: 8 }, () => trait());
  const [A, B, C, D, E, F, G, H] = tags;

  function check(name: string, expected: number, count: (entities: Entity[]) => number) {
    bench(name, function* () {
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, (_, i) => world.spawn(tags[i % 8]));
      const result = yield () => count(entities);
      assert.equal(result, expected);
      world.destroy();
    });
  }

  check('one fixed trait, one in eight matches', 1_250, (entities) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      if (entities[i].has(A)) matches++;
    }
    return matches;
  });

  check('two fixed traits, short-circuit OR', 2_500, (entities) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.has(A) || entity.has(B)) matches++;
    }
    return matches;
  });

  // Separate call sites exercise the inlining budget of a system that checks several traits.
  check('four fixed traits', 5_000, (entities) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.has(A)) matches++;
      if (entity.has(B)) matches++;
      if (entity.has(C)) matches++;
      if (entity.has(D)) matches++;
    }
    return matches;
  });

  check('eight fixed traits', 10_000, (entities) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.has(A)) matches++;
      if (entity.has(B)) matches++;
      if (entity.has(C)) matches++;
      if (entity.has(D)) matches++;
      if (entity.has(E)) matches++;
      if (entity.has(F)) matches++;
      if (entity.has(G)) matches++;
      if (entity.has(H)) matches++;
    }
    return matches;
  });

  check('varying trait, half match', 5_000, (entities) => {
    let matches = 0;
    for (let i = 0; i < entities.length; i++) {
      // Alternate eight hits and eight misses while visiting all eight traits.
      if (entities[i].has(tags[(i + ((i >>> 3) & 1)) & 7])) matches++;
    }
    return matches;
  });
});

group('entity.has pair dispatch over 10k entities @entity @has', () => {
  for (const kind of ['relation pair', 'identifier pair', 'identifier'] as const) {
    bench(kind, function* () {
      const world = createWorld();
      const Name = identifier({ exclusive: false });
      const pair = kind === 'relation pair' ? relation()(world.spawn()) : Name('active');
      const term = kind === 'identifier' ? Name : pair;
      const entities = Array.from({ length: 10_000 }, (_, i) =>
        i % 2 === 0 ? world.spawn(pair) : world.spawn()
      );
      const result = yield () => {
        let matches = 0;
        for (let i = 0; i < entities.length; i++) {
          if (entities[i].has(term)) matches++;
        }
        return matches;
      };
      assert.equal(result, 5_000);
      world.destroy();
    });
  }
});
