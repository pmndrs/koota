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
    bench('3 traits', function* () {
        yield () => createQueryHash(simple);
    }).gc('inner');

    bench('modifiers', function* () {
        yield () => createQueryHash(withModifiers);
    }).gc('inner');

    bench('relation + modifiers', function* () {
        yield () => createQueryHash(withRelation);
    }).gc('inner');

    bench('dense mixed (7 params)', function* () {
        yield () => createQueryHash(dense);
    }).gc('inner');

    bench('relation target filter', function* () {
        yield () => createQueryHash(targetFilter);
    }).gc('inner');
});
