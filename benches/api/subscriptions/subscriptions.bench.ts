import { assert, bench, group } from '@pmndrs/labs';
import { $internal, createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0 });

// One subscriber per entity, the shape every framework hook produces.
// world.onChange fans every set out to every subscriber, so N changes is N * N calls.
// entity.onChange dispatches only to that entity's subscribers.
group('change subscriptions per entity @change @subscription', () => {
  const count = 1000;
  for (const scope of ['world', 'entity'] as const) {
    bench(`${scope}.onChange, ${count} subscribers, ${count} changed`, function* () {
      const world = createWorld();
      const entities: Entity[] = [];
      let hits = 0;

      for (let i = 0; i < count; i++) {
        const entity = world.spawn(Position);
        entities.push(entity);
        if (scope === 'world') {
          world.onChange(Position, (e) => {
            if (e === entity) hits++;
          });
        } else {
          entity.onChange(Position, () => hits++);
        }
      }

      yield () => {
        hits = 0;
        for (let i = 0; i < count; i++) {
          entities[i].set(Position, { x: i, y: i });
        }
      };

      world.destroy();
      assert.equal(hits, count);
      return hits;
    });
  }
});

// One observer per entity on add and remove, the shape framework hooks produce for structural
// changes. The direct row is the control. The settled row adds the queue and the settlement.
group('structural subscriptions per entity @subscription @settled', () => {
  const count = 1000;
  for (const mode of ['direct', 'settled'] as const) {
    bench(`${mode} onAdd + onRemove, ${count} subscribers, ${count} toggled`, function* () {
      const Tag = trait();
      const world = createWorld();
      const entities: Entity[] = [];
      let hits = 0;

      for (let i = 0; i < count; i++) {
        const entity = world.spawn();
        entities.push(entity);
        const notify =
          mode === 'direct' ? () => hits++ : world[$internal].observeSettled(() => hits++).invalidate;
        entity.onAdd(Tag, notify);
        entity.onRemove(Tag, notify);
      }

      yield () => {
        hits = 0;
        for (let i = 0; i < count; i++) {
          entities[i].add(Tag);
          entities[i].remove(Tag);
        }
      };

      world.destroy();
      assert.equal(hits, count * 2);
      return hits;
    });
  }
});
