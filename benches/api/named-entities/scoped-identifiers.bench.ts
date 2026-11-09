import assert from 'node:assert/strict';
import { bench, group } from '@pmndrs/labs';
import { createWorld, identifier, relation, type Entity } from 'koota';

/** Identical entities and keys for every lookup, with an independent nested-map reference. */
function createHierarchy() {
  const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' });
  const Name = identifier({ scope: ChildOf });
  const world = createWorld();
  const nested = new Map<string, Map<string, Map<string, Entity>>>();
  const byParent = new Map<Entity, Map<string, Entity>>();
  const paths: { root: string; arm: string; part: string; parent: Entity; entity: Entity }[] = [];
  for (let r = 0; r < 64; r++) {
    const rootKey = `robot-${r}`;
    const root = world.spawn(Name(rootKey));
    const arms = new Map<string, Map<string, Entity>>();
    nested.set(rootKey, arms);
    for (let a = 0; a < 8; a++) {
      const armKey = `arm-${a}`;
      const arm = world.spawn(ChildOf(root), Name(armKey));
      const parts = new Map<string, Entity>();
      arms.set(armKey, parts);
      byParent.set(arm, parts);
      for (let p = 0; p < 8; p++) {
        const partKey = `part-${p}`;
        const entity = world.spawn(ChildOf(arm), Name(partKey));
        parts.set(partKey, entity);
        paths.push({ root: rootKey, arm: armKey, part: partKey, parent: arm, entity });
      }
    }
  }
  return { world, Name, nested, byParent, paths };
}

group('scoped name lookup 4096 @identifier-scope @identifier @graph', () => {
  for (const mode of ['koota inline terms', 'koota reused terms', 'handwritten nested maps']) {
    for (const missing of [false, true]) {
      bench(`${mode} / three keys / ${missing ? 'missing leaf' : 'hit'}`, function* () {
        const { world, Name, nested, paths } = createHierarchy();
        const requests = paths.map((path) => ({ ...path, part: missing ? 'absent' : path.part }));
        const terms = requests.map(({ root, arm, part }) => [Name(root), Name(arm), Name(part)]);
        let read: (i: number) => Entity | undefined;
        if (mode === 'koota inline terms') {
          read = (i) => {
            const { root, arm, part } = requests[i];
            return world.lookup(Name(root), Name(arm), Name(part));
          };
        } else if (mode === 'koota reused terms') {
          read = (i) => world.lookup(terms[i][0], terms[i][1], terms[i][2]);
        } else {
          read = (i) => {
            const { root, arm, part } = requests[i];
            return nested.get(root)?.get(arm)?.get(part);
          };
        }
        for (let i = 0; i < paths.length; i++) {
          assert.equal(read(i), missing ? undefined : paths[i].entity);
        }
        const count = yield () => {
          let count = 0;
          for (let i = 0; i < paths.length; i++) if (read(i) !== undefined) count++;
          return count;
        };
        assert.equal(count, missing ? 0 : 4096);
        world.destroy();
        return count;
      });
    }
  }

  for (const mode of ['koota inline terms', 'koota reused terms', 'handwritten parent map']) {
    bench(`${mode} / parent and key`, function* () {
      const { world, Name, byParent, paths } = createHierarchy();
      const terms = paths.map(({ part }) => Name(part));
      let read: (i: number) => Entity | undefined;
      if (mode === 'koota inline terms') {
        read = (i) => world.lookup(paths[i].parent, Name(paths[i].part));
      } else if (mode === 'koota reused terms') {
        read = (i) => world.lookup(paths[i].parent, terms[i]);
      } else {
        read = (i) => byParent.get(paths[i].parent)?.get(paths[i].part);
      }
      for (let i = 0; i < paths.length; i++) assert.equal(read(i), paths[i].entity);
      const count = yield () => {
        let count = 0;
        for (let i = 0; i < paths.length; i++) if (read(i) !== undefined) count++;
        return count;
      };
      assert.equal(count, 4096);
      world.destroy();
      return count;
    });
  }
});

group('scoped name reparent 1024 @identifier-scope @identifier @graph', () => {
  for (const indexed of [true, false]) {
    bench(indexed ? 'koota scoped identifier' : 'handwritten index plus relation', function* () {
      const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' });
      const Name = identifier(indexed ? { scope: ChildOf } : undefined);
      const world = createWorld();
      const first = world.spawn();
      const second = world.spawn();
      const names = Array.from({ length: 1024 }, (_, i) => `part-${i}`);
      const entities = names.map((name) =>
        indexed ? world.spawn(ChildOf(first), Name(name)) : world.spawn(ChildOf(first))
      );
      const byParent = new Map<Entity, Map<string, Entity>>([
        [first, new Map(names.map((name, i) => [name, entities[i]]))],
        [second, new Map()],
      ]);
      let source = first;
      let destination = second;
      yield {
        bench: () => {
          const old = byParent.get(source)!;
          const next = byParent.get(destination)!;
          for (let i = 0; i < entities.length; i++) {
            if (!indexed) {
              if (next.has(names[i])) throw new Error('Name collision');
              old.delete(names[i]);
              next.set(names[i], entities[i]);
            }
            entities[i].add(ChildOf(destination));
          }
          [source, destination] = [destination, source];
        },
        snapshot: () => {
          for (let i = 0; i < entities.length; i++) {
            assert.equal(entities[i].targetFor(ChildOf), source);
            assert.equal(
              indexed ? world.lookup(source, Name(names[i])) : byParent.get(source)!.get(names[i]),
              entities[i]
            );
          }
          return entities.length;
        },
      };
      world.destroy();
    });
  }
});
