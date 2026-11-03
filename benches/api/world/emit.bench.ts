import { assert, bench, group } from '@pmndrs/labs';
import { createListener, createWorld, trait } from 'koota';

const Damage = trait({ amount: 0 });
const IsCritical = trait();

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

  bench('emit 2 traits, no listener', function* () {
    const world = createWorld();

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.emit(Damage({ amount: i }), IsCritical);
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

  bench('emit 1 trait, drained by 4 listeners', function* () {
    const world = createWorld();
    const listeners = [0, 1, 2, 3].map(() => createListener(Damage));
    for (const listener of listeners) world.query(listener);
    let drained = 0;

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.emit(Damage({ amount: i }));
      },
      snapshot: () => drained,
      after: () => {
        drained = 0;
        for (const listener of listeners) drained += world.query(listener).length;
        assert.equal(drained, 40_000);
      },
    };

    world.destroy();
  });

  bench('emit 1 trait, read by a listener with each', function* () {
    const world = createWorld();
    const listener = createListener(Damage);
    world.query(listener);
    let sum = 0;

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) world.emit(Damage({ amount: i }));
        sum = 0;
        world.query(listener).each((damage) => {
          sum += damage.amount;
        });
      },
      snapshot: () => sum,
      after: () => assert.equal(sum, 49_995_000),
    };

    world.destroy();
  });
});

// The floor: a hand rolled event buffer with no entity, no mask and no query, pushed and read
// the way a game would do it by hand.
group('bare event buffer 10k @world @emit', () => {
  bench('push objects, read with a loop', function* () {
    let events: { amount: number }[] = [];
    let sum = 0;

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) events.push({ amount: i });
        sum = 0;
        for (let i = 0; i < events.length; i++) sum += events[i].amount;
        events = [];
      },
      snapshot: () => sum,
      after: () => assert.equal(sum, 49_995_000),
    };
  });

  bench('push into a typed ring, read with a cursor', function* () {
    const capacity = 16_384;
    const amount = new Float64Array(capacity);
    let head = 0;
    let count = 0;
    let sum = 0;

    yield {
      bench: () => {
        for (let i = 0; i < 10_000; i++) {
          amount[(head + count) & (capacity - 1)] = i;
          count++;
        }
        sum = 0;
        for (let i = 0; i < count; i++) sum += amount[(head + i) & (capacity - 1)];
        head = (head + count) & (capacity - 1);
        count = 0;
      },
      snapshot: () => sum,
      after: () => assert.equal(sum, 49_995_000),
    };
  });
});
