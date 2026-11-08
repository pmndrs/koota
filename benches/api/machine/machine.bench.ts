import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, machine, trait } from 'koota';

group('machine transitions 10k @machine @mutation', () => {
  for (const observers of ['none', 'queries']) {
    bench(`re-enter one state, observers ${observers}`, function* () {
      const Loading = trait({ requestId: 0 });
      const Download = machine({ states: { Loading }, initial: Loading });
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Download));
      let queryEvents = 0;
      if (observers === 'queries') {
        world.onEnter([Loading], () => queryEvents++);
        world.onExit([Loading], () => queryEvents++);
      }

      yield {
        bench: () => {
          for (const entity of entities) {
            Download.enter(entity, Loading);
            Download.enter(entity, Loading);
          }
        },
        snapshot: () => {
          assert.equal(Download.current(entities[9999]), Loading);
          assert.equal(entities[9999].get(Loading)?.requestId, 0);
          assert.equal(queryEvents, 0);
          return entities.length;
        },
      };
      world.destroy();
    });
  }

  for (const observers of ['none', 'transitions', 'queries']) {
    bench(`enter two states, observers ${observers}`, function* () {
      const Idle = trait();
      const Loading = trait({ requestId: 0 });
      const Download = machine({ states: { Idle, Loading }, initial: Idle });
      const world = createWorld();
      const entities = Array.from({ length: 10_000 }, () => world.spawn(Download));
      let transitions = 0;
      let queryEvents = 0;
      if (observers !== 'none') {
        world.query(Idle);
        world.query(Loading);
        world.query(Download);
        world.onTransition(Download, () => transitions++);
      }
      if (observers === 'queries') {
        world.onEnter([Loading], () => queryEvents++);
        world.onExit([Loading], () => queryEvents++);
      }

      yield {
        bench: () => {
          for (const entity of entities) {
            Download.enter(entity, Loading);
            Download.enter(entity, Idle);
          }
        },
        snapshot: () => {
          assert.equal(Download.current(entities[9999]), Idle);
          assert.equal(entities[9999].has(Loading), false);
          if (observers !== 'none') assert.equal(transitions > 0, true);
          if (observers === 'queries') assert.equal(queryEvents, transitions);
          return entities.length;
        },
      };
      world.destroy();
    });
  }
});
