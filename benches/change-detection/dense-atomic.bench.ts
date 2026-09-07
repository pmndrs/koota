import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, trait } from 'koota';

group('dense atomic change detection 10k @change @dense @atomic', () => {
  const Position = trait(() => ({ x: 0, y: 0 }));
  const Velocity = trait(() => ({ x: 1, y: 2 }));

  for (const [changeDetection, observed] of [
    ['auto', false],
    ['auto', true],
    ['always', true],
  ] as const) {
    bench(
      `updateEach ${changeDetection}, ${observed ? 'world.onChange' : 'no consumers'}`,
      function* () {
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) world.spawn(Position, Velocity);
        const first = world.queryFirst(Position)!;
        let hits = 0;
        let frames = 0;
        if (observed) world.onChange(Position, () => hits++);

        yield () => {
          hits = 0;
          frames++;
          world.query(Position, Velocity).updateEach(
            ([position, velocity]) => {
              position.x += velocity.x;
              position.y += velocity.y;
            },
            { changeDetection }
          );
        };

        assert.equal(first.get(Position)!.x, frames);
        assert.equal(first.get(Position)!.y, frames * 2);
        assert.equal(hits, observed ? 10_000 : 0);
        world.destroy();
        return hits;
      }
    );
  }
});
