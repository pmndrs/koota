// TODO remove these benches before merge?

import { bench, group, run } from 'mitata';
import { createWorld, Entity, trait } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });
const Acceleration = trait({ ax: 0, ay: 0, az: 0 });
const Damping = trait({ dx: 1, dy: 1, dz: 1 });

group('useStores-iteration', () => {
    bench('50k entities, 2 traits — position += velocity', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            world.spawn(Position({ x: i, y: i, z: i }), Velocity({ vx: 1, vy: 1, vz: 1 }));
        }

        world.query(Position, Velocity);

        yield () => {
            world.query(Position, Velocity).useStores(([pos, vel], entities) => {
                for (let i = 0; i < entities.length; i++) {
                    const eid = entities[i].id();
                    pos.x[eid] += vel.vx[eid];
                    pos.y[eid] += vel.vy[eid];
                    pos.z[eid] += vel.vz[eid];
                }
            });
        };

        world.destroy();
    }).gc('inner');

    bench('50k entities, 1 trait — sum positions', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            world.spawn(Position({ x: i, y: i * 2, z: i * 3 }));
        }
        world.query(Position);

        yield () => {
            let sum = 0;
            world.query(Position).useStores(([pos], entities) => {
                for (let i = 0; i < entities.length; i++) {
                    const eid = entities[i].id();
                    sum += pos.x[eid] + pos.y[eid] + pos.z[eid];
                }
            });
            return sum;
        };

        world.destroy();
    }).gc('inner');

    bench('100k entities, 50% selectivity — 2 traits', function* () {
        const world = createWorld();
        for (let i = 0; i < 100_000; i++) {
            if (i % 2 === 0) {
                world.spawn(Position({ x: i, y: i, z: i }), Velocity({ vx: 1, vy: 1, vz: 1 }));
            } else {
                world.spawn(Position({ x: i, y: i, z: i }));
            }
        }
        world.query(Position, Velocity);

        yield () => {
            world.query(Position, Velocity).useStores(([pos, vel], entities) => {
                for (let i = 0; i < entities.length; i++) {
                    const eid = entities[i].id();
                    pos.x[eid] += vel.vx[eid];
                    pos.y[eid] += vel.vy[eid];
                    pos.z[eid] += vel.vz[eid];
                }
            });
        };

        world.destroy();
    }).gc('inner');
});

group('useStores-4-traits', () => {
    bench('50k entities, 4 traits — full physics step', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            world.spawn(
                Position({ x: i, y: i, z: i }),
                Velocity({ vx: 1, vy: 1, vz: 1 }),
                Acceleration({ ax: 0.1, ay: -9.8, az: 0 }),
                Damping({ dx: 0.99, dy: 0.99, dz: 0.99 })
            );
        }
        world.query(Position, Velocity, Acceleration, Damping);

        yield () => {
            world
                .query(Position, Velocity, Acceleration, Damping)
                .useStores(([pos, vel, acc, damp], entities) => {
                    for (let i = 0; i < entities.length; i++) {
                        const eid = entities[i].id();
                        vel.vx[eid] += acc.ax[eid];
                        vel.vy[eid] += acc.ay[eid];
                        vel.vz[eid] += acc.az[eid];
                        vel.vx[eid] *= damp.dx[eid];
                        vel.vy[eid] *= damp.dy[eid];
                        vel.vz[eid] *= damp.dz[eid];
                        pos.x[eid] += vel.vx[eid];
                        pos.y[eid] += vel.vy[eid];
                        pos.z[eid] += vel.vz[eid];
                    }
                });
        };

        world.destroy();
    }).gc('inner');
});

group('updateEach-4-traits', () => {
    bench('50k entities, 4 traits — full physics step', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            world.spawn(
                Position({ x: i, y: i, z: i }),
                Velocity({ vx: 1, vy: 1, vz: 1 }),
                Acceleration({ ax: 0.1, ay: -9.8, az: 0 }),
                Damping({ dx: 0.99, dy: 0.99, dz: 0.99 })
            );
        }
        world.query(Position, Velocity, Acceleration, Damping);

        yield () => {
            world.query(Position, Velocity, Acceleration, Damping).updateEach(
                ([pos, vel, acc, damp]) => {
                    vel.vx += acc.ax;
                    vel.vy += acc.ay;
                    vel.vz += acc.az;
                    vel.vx *= damp.dx;
                    vel.vy *= damp.dy;
                    vel.vz *= damp.dz;
                    pos.x += vel.vx;
                    pos.y += vel.vy;
                    pos.z += vel.vz;
                },
                { changeDetection: 'never' }
            );
        };

        world.destroy();
    }).gc('inner');
});

group('updateEach-iteration', () => {
    bench('50k entities, 2 traits — position += velocity', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            world.spawn(Position({ x: i, y: i, z: i }), Velocity({ vx: 1, vy: 1, vz: 1 }));
        }
        world.query(Position, Velocity);

        yield () => {
            world.query(Position, Velocity).updateEach(
                ([pos, vel]) => {
                    pos.x += vel.vx;
                    pos.y += vel.vy;
                    pos.z += vel.vz;
                },
                { changeDetection: 'never' }
            );
        };

        world.destroy();
    }).gc('inner');

    bench('10k entities, 2 traits — position += velocity', function* () {
        const world = createWorld();
        for (let i = 0; i < 10_000; i++) {
            world.spawn(Position({ x: i, y: i, z: i }), Velocity({ vx: 1, vy: 1, vz: 1 }));
        }
        world.query(Position, Velocity);

        yield () => {
            world.query(Position, Velocity).updateEach(
                ([pos, vel]) => {
                    pos.x += vel.vx;
                    pos.y += vel.vy;
                    pos.z += vel.vz;
                },
                { changeDetection: 'never' }
            );
        };

        world.destroy();
    }).gc('inner');
});

group('readEach-iteration', () => {
    bench('50k entities, 2 traits — read all', function* () {
        const world = createWorld();
        for (let i = 0; i < 50_000; i++) {
            world.spawn(Position({ x: i, y: i, z: i }), Velocity({ vx: 1, vy: 1, vz: 1 }));
        }
        world.query(Position, Velocity);

        yield () => {
            let sum = 0;
            world.query(Position, Velocity).readEach(([pos, vel]) => {
                sum += pos.x + pos.y + pos.z + vel.vx + vel.vy + vel.vz;
            });
            return sum;
        };

        world.destroy();
    }).gc('inner');
});

group('random-access-10k', () => {
    bench('entity.get — sequential', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position({ x: i, y: i, z: i })));
        }

        yield () => {
            let sum = 0;
            for (let i = 0; i < entities.length; i++) {
                const pos = entities[i].get(Position)!;
                sum += pos.x + pos.y + pos.z;
            }
            return sum;
        };

        world.destroy();
    }).gc('inner');

    bench('entity.set — sequential', function* () {
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 10_000; i++) {
            entities.push(world.spawn(Position({ x: i, y: i, z: i })));
        }

        yield () => {
            for (let i = 0; i < entities.length; i++) {
                entities[i].set(Position, { x: i * 2, y: i * 2, z: i * 2 });
            }
        };

        world.destroy();
    }).gc('inner');
});

await run();
