import { bench, group } from 'labs';
import { createWorld, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });

group('entity-get-set-10k', () => {
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

group('high-trait-count-10k', () => {
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
