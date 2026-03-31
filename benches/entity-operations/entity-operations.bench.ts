import { bench, group } from '@pmndrs/labs';
import { createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ vx: 0, vy: 0, vz: 0 });

group('spawn throughput 50k @entity', () => {
	bench('bare spawn (no traits)', function* () {
		const world = createWorld();

		yield () => {
			for (let i = 0; i < 50_000; i++) {
				world.spawn();
			}
		};

		world.destroy();
	}).gc('inner');

	bench('spawn with 1 trait', function* () {
		const world = createWorld();

		yield () => {
			for (let i = 0; i < 50_000; i++) {
				world.spawn(Position);
			}
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
		for (let i = 0; i < 10_000; i++) {
			entities.push(world.spawn(Position));
		}

		yield () => {
			for (let i = 0; i < entities.length; i++) {
				entities[i].destroy();
			}
		};

		world.destroy();
	}).gc('inner');

	bench('destroy entities with 3 traits', function* () {
		const world = createWorld();
		const Tag = trait();
		const entities: Entity[] = [];
		for (let i = 0; i < 10_000; i++) {
			entities.push(world.spawn(Position, Velocity, Tag));
		}

		yield () => {
			for (let i = 0; i < entities.length; i++) {
				entities[i].destroy();
			}
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

group('high trait count 10k @entity', () => {
	const TRAIT_COUNT = 64;
	const manyTraits = Array.from({ length: TRAIT_COUNT }, (_, i) => trait({ value: i }));

	bench('64 traits exist, spawn entity with 8 random', function* () {
		const world = createWorld();

		yield () => {
			for (let i = 0; i < 10_000; i++) {
				const o = i % (TRAIT_COUNT - 8);
				world.spawn(
					manyTraits[o],
					manyTraits[o + 1],
					manyTraits[o + 2],
					manyTraits[o + 3],
					manyTraits[o + 4],
					manyTraits[o + 5],
					manyTraits[o + 6],
					manyTraits[o + 7]
				);
			}
		};

		world.destroy();
	}).gc('inner');

	bench('64 traits exist, query 4 traits', function* () {
		const world = createWorld();
		for (let i = 0; i < 10_000; i++) {
			const o = i % (TRAIT_COUNT - 8);
			world.spawn(
				manyTraits[o],
				manyTraits[o + 1],
				manyTraits[o + 2],
				manyTraits[o + 3],
				manyTraits[o + 4],
				manyTraits[o + 5],
				manyTraits[o + 6],
				manyTraits[o + 7]
			);
		}

		yield () => {
			world.query(manyTraits[0], manyTraits[1], manyTraits[2], manyTraits[3]);
		};

		world.destroy();
	}).gc('inner');
});
