import { bench, group } from '@pmndrs/labs';
import { Not, Or, relation, trait, type Entity, type QueryParameter } from 'koota';
import { createQueryHash } from '../../packages/core/src/query/utils/create-query-hash';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Health = trait({ hp: 100 });
const IsActive = trait();
const IsStatic = trait();
const IsPlayer = trait();
const ChildOf = relation();

const parent = 101 as any as Entity;

const one: QueryParameter[] = [Position];
const two: QueryParameter[] = [Position, Velocity];
const simple: QueryParameter[] = [Position, Velocity, Health];
const withModifiers: QueryParameter[] = [Position, Not(IsStatic), Or(Velocity, Health)];
const withRelation: QueryParameter[] = [ChildOf(parent), Position, Not(IsStatic)];
const dense: QueryParameter[] = [
  Position,
  Velocity,
  Health,
  IsActive,
  Not(IsStatic),
  Or(Position, Velocity, Health),
  ChildOf(parent),
];
const targetFilter: QueryParameter[] = [ChildOf(IsPlayer, IsActive), Position];

group('query hash @query @hash', () => {
  bench('1 trait', function* () {
    yield () => createQueryHash(one);
  });

  bench('2 traits', function* () {
    yield () => createQueryHash(two);
  });

  bench('3 traits', function* () {
    yield () => createQueryHash(simple);
  });

  bench('modifiers', function* () {
    yield () => createQueryHash(withModifiers);
  });

  bench('relation + modifiers', function* () {
    yield () => createQueryHash(withRelation);
  });

  bench('dense mixed (7 params)', function* () {
    yield () => createQueryHash(dense);
  });

  bench('relation target filter', function* () {
    yield () => createQueryHash(targetFilter);
  });
});

// An inline query pays to build its parameters on every call before anything is looked up.
// Traits are defined once so they cost nothing, but modifiers and relation pairs are calls.
group('query parameter construction @query @hash', () => {
  bench('Not(trait)', function* () {
    yield () => Not(IsStatic);
  });

  bench('Or(trait, trait)', function* () {
    yield () => Or(Velocity, Health);
  });

  bench('relation(entity)', function* () {
    yield () => ChildOf(parent);
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
