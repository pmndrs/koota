import { bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Tag = trait();

group('destroy then query commit 10k @entity @destroy', () => {
  bench('hot1 spawn destroy commit', function* () {
    const world = createWorld();
    world.query(Position);
    world.query(Position, Tag);
    world.query(Tag);

    yield {
      bench: () => {
        const entities = [];
        for (let i = 0; i < 10_000; i++) entities.push(world.spawn(Position, Tag));
        for (let i = 0; i < entities.length; i++) entities[i].destroy();
        world.query(Tag);
      },
      snapshot: () => world.query(Tag).length,
    };

    world.destroy();
  });
});
