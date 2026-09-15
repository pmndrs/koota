import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0 });

// One subscriber per entity, the shape every framework hook produces.
// world.onChange fans every set out to every subscriber, so N changes is N * N calls.
// entity.onChange dispatches only to that entity's subscribers.
group('change subscriptions per entity @change @subscription', () => {
  for (const count of [500, 1000, 2000]) {
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
  }
});
