import { bench, group, run } from 'mitata';
import { createWorld, Entity, Not, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Health = trait({ hp: 100 });
const IsActive = trait();
const IsStatic = trait();
const HasPhysics = trait();
const HasRender = trait();
const HasAI = trait();
const HasCollider = trait();

group('query-selectivity-50k', () => {
    bench('1 trait, 100% match', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) world.spawn(Velocity);

        yield () => {
            world.query(Velocity);
        };

        world.destroy();
    }).gc('inner');
    bench('1 trait, ~1% match', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            if (i % 100 === 0) {
                world.spawn(Velocity);
            } else world.spawn();
        }

        yield () => {
            world.query(Velocity);
        };

        world.destroy();
    }).gc('inner');
    bench('1 trait, ~0.1% match', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            if (i % 1000 === 0) {
                world.spawn(Velocity);
            } else world.spawn();
        }

        yield () => {
            world.query(Velocity);
        };

        world.destroy();
    }).gc('inner');
});

group('n-way-intersection-100k', () => {
    const buildNWay = () => {
        const world = createWorld();
        for (let i = 0; i < 100_000; i++) {
            const traits: any[] = [Position];
            if (i % 2 === 0) traits.push(Velocity);
            if (i % 3 === 0) traits.push(Health);
            if (i % 5 === 0) traits.push(HasRender);
            if (i % 7 === 0) traits.push(HasPhysics);
            if (i % 11 === 0) traits.push(HasAI);
            if (i % 13 === 0) traits.push(HasCollider);
            world.spawn(...traits);
        }
        return world;
    };

    bench('1 trait, 100% match', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position);
        };
        world.destroy();
    }).gc('inner');

    bench('2 traits, 50% match', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position, Velocity);
        };
        world.destroy();
    }).gc('inner');

    bench('3 traits, ~16% match)', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position, Velocity, Health);
        };
        world.destroy();
    }).gc('inner');

    bench('4 traits, ~3.3% match)', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position, Velocity, Health, HasRender);
        };
        world.destroy();
    }).gc('inner');

    bench('5 traits, ~0.476% match)', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position, Velocity, Health, HasRender, HasPhysics);
        };
        world.destroy();
    }).gc('inner');

    bench('6 traits, ~0.043% match', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position, Velocity, Health, HasRender, HasPhysics, HasAI);
        };
        world.destroy();
    }).gc('inner');

    bench('7 traits, ~0.003% match', function* () {
        const world = buildNWay();
        yield () => {
            world.query(Position, Velocity, Health, HasRender, HasPhysics, HasAI, HasCollider);
        };
        world.destroy();
    }).gc('inner');
});

group('not-exclusion-50k', () => {
    bench('2 traits, 1% entities excluded', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            if (i % 100 === 0) {
                world.spawn(Position, IsStatic);
            } else world.spawn(Position);
        }

        yield () => {
            world.query(Position, Not(IsStatic));
        };

        world.destroy();
    }).gc('inner');

    bench('2 traits, 50% entities excluded', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            if (i % 2 === 0) {
                world.spawn(Position, IsStatic);
            } else world.spawn(Position);
        }

        yield () => {
            world.query(Position, Not(IsStatic));
        };

        world.destroy();
    }).gc('inner');
});

group('query-throughput-50k', () => {
    bench('3 traits, query 2 - 50% match', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            const traits: any[] = [Position];
            if (i % 2 === 0) traits.push(Velocity);
            if (i % 5 === 0) traits.push(Health);
            world.spawn(...traits);
        }
        world.query(Position, Velocity);

        yield () => {
            world.query(Position, Velocity);
        };

        world.destroy();
    }).gc('inner');

    bench('3 traits, query 3 - 10% match', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            const traits: any[] = [Position];
            if (i % 2 === 0) traits.push(Velocity);
            if (i % 5 === 0) traits.push(Health);
            world.spawn(...traits);
        }
        world.query(Position, Velocity, Health);

        yield () => {
            world.query(Position, Velocity, Health);
        };

        world.destroy();
    }).gc('inner');
});

group('query-maintenance-10k', () => {
    const buildWithQueries = () => {
        const world = createWorld();
        const traitSubsets = [
            [Position],
            [Velocity],
            [Health],
            [Position, Velocity],
            [Position, Health],
            [Velocity, Health],
            [Position, Velocity, Health],
            [Position, IsActive],
            [Velocity, IsActive],
            [Health, IsActive],
            [HasRender],
            [HasPhysics],
            [HasRender, HasPhysics],
            [Position, HasRender],
            [Position, HasPhysics],
            [Velocity, HasRender],
            [Velocity, HasPhysics],
            [Position, Velocity, HasRender],
            [Position, Velocity, HasPhysics],
            [Position, Velocity, Health, HasRender],
        ];
        for (const subset of traitSubsets) world.query(...subset);
        return world;
    };

    bench('spawn when 20 queries active', function* () {
        const world = buildWithQueries();
        yield () => {
            for (let i = 0; i < 10_000; i++) {
                world.spawn(Position, Velocity, Health);
            }
        };
        world.destroy();
    }).gc('inner');

    bench('add trait when 20 queries active', function* () {
        const world = buildWithQueries();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position, Velocity));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].add(HasRender);
            }
        };

        world.destroy();
    }).gc('inner');

    bench('remove trait when 20 queries active', function* () {
        const world = buildWithQueries();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position, Velocity, Health, HasRender));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].remove(Velocity);
            }
        };

        world.destroy();
    }).gc('inner');
});

await run();
