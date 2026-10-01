import { bench, group } from '@pmndrs/labs';
import { createWorld, Not, Or, relation, trait } from 'koota';

const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Health = trait({ hp: 100 });
const IsStatic = trait();
const IsPlayer = trait();
const IsActive = trait();
const ChildOf = relation();

// An inline query pays to build its parameters on every call before anything is looked up.
// Traits are defined once so they cost nothing, but modifiers and relation pairs are calls.
group('query parameter construction @query @query-parameters', () => {
  bench('Not(trait)', function* () {
    yield () => Not(IsStatic);
  });

  bench('Or(trait, trait)', function* () {
    yield () => Or(Velocity, Health);
  });

  bench('relation(entity)', function* () {
    const world = createWorld();
    const parent = world.spawn();

    yield () => ChildOf(parent);

    world.destroy();
  });

  bench('relation(trait)', function* () {
    yield () => ChildOf(IsPlayer);
  });

  bench('relation(trait, trait)', function* () {
    yield () => ChildOf(IsPlayer, IsActive);
  });

  bench('relation(trait, relation(trait))', function* () {
    yield () => ChildOf(IsPlayer, ChildOf(IsActive));
  });
});
