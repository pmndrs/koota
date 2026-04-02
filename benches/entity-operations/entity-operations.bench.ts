import { bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });

group('spawn throughput 10k @entity', () => {
    bench('spawn with no traits', function* () {
        const world = createWorld();

        yield {
            bench: () => {
                for (let i = 0; i < 10_000; i++) {
                    world.spawn();
                }
            },
            after: () => world.reset(),
        };

        world.destroy();
    }).gc('inner');

    bench('spawn with 1 trait', function* () {
        const world = createWorld();

        yield {
            bench: () => {
                for (let i = 0; i < 10_000; i++) {
                    world.spawn(Position);
                }
            },
            after: () => world.reset(),
        };

        world.destroy();
    }).gc('inner');
});

group('entity.has dispatch 10k @entity', () => {
    bench('entity.has (true)', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].has(Position);
            }
        };

        world.destroy();
    }).gc('inner');

    bench('entity.has (false)', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].has(Velocity);
            }
        };

        world.destroy();
    }).gc('inner');
});

group('entity.destroy 10k @entity', () => {
    bench('destroy entities', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        const spawn = () => {
            for (let i = 0; i < 10_000; i++) entities[i] = world.spawn(Position);
        };
        spawn();

        yield {
            bench: () => {
                for (let i = 0; i < entities.length; i++) {
                    entities[i].destroy();
                }
            },
            after: spawn,
        };

        world.destroy();
    }).gc('inner');

    bench('destroy entities with 3 traits', function* () {
        const world = createWorld();
        const Tag = trait();
        const entities: Entity[] = [];
        const spawn = () => {
            for (let i = 0; i < 10_000; i++) entities[i] = world.spawn(Position, Velocity, Tag);
        };
        spawn();

        yield {
            bench: () => {
                for (let i = 0; i < entities.length; i++) {
                    entities[i].destroy();
                }
            },
            after: spawn,
        };

        world.destroy();
    }).gc('inner');
});

group('entity get set 10k @entity', () => {
    bench('entity.get', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].get(Position);
            }
        };

        world.destroy();
    }).gc('inner');

    bench('entity.set', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].set(Position, { x: i, y: i, z: i });
            }
        };

        world.destroy();
    }).gc('inner');
});
