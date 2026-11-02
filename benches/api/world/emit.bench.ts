import { assert, bench, group } from '@pmndrs/labs';
import { createListener, createWorld, trait } from 'koota';

const Damage = trait({ amount: 0 });

group('emit 10k @world @emit', () => {
  bench('emit 1 trait, no listener', function* () {
    const world = createWorld();

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.emit(Damage({ amount: i }));
      },
      snapshot: () => world.query(Damage).length,
    };

    world.destroy();
  });

  bench('emit 1 trait, drained by a listener', function* () {
    const world = createWorld();
    const listener = createListener(Damage);
    world.query(listener);
    let drained = 0;

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.emit(Damage({ amount: i }));
      },
      snapshot: () => drained,
      after: () => {
        drained = world.query(listener).length;
        assert.equal(drained, 10_000);
      },
    };

    world.destroy();
  });
});
