import { bench, group } from 'labs';
import { createWorld, relation, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });

group('relation queries 10k @relation', () => {
	const ChildOf = relation();

	bench('1 parent query ChildOf(parent)', function* () {
		const world = createWorld();
		const parent = world.spawn(Position);
		for (let i = 0; i < 10_000; i++) {
			world.spawn(Position, ChildOf(parent));
		}

		yield () => {
			world.query(ChildOf(parent));
		};

		world.destroy();
	}).gc('inner');

	bench('100 parents, ChildOf(*)', function* () {
		const world = createWorld();
		const parents: Entity[] = [];
		for (let i = 0; i < 100; i++) {
			parents.push(world.spawn(Position));
		}
		for (let i = 0; i < 10_000; i++) {
			world.spawn(Position, ChildOf(parents[i % 100]));
		}

		yield () => {
			world.query(ChildOf('*'));
		};

		world.destroy();
	}).gc('inner');
});

group('many targets single relation 10k @relation', () => {
	for (const targetCount of [10, 100, 1000]) {
		bench(`${targetCount} targets, query specific`, function* () {
			const Rel = relation();
			const world = createWorld();
			const targets: Entity[] = [];
			for (let i = 0; i < targetCount; i++) {
				targets.push(world.spawn(Position));
			}
			for (let i = 0; i < 10_000; i++) {
				world.spawn(Position, Rel(targets[i % targetCount]));
			}

			const queryTarget = targets[0];
			yield () => {
				world.query(Rel(queryTarget));
			};

			world.destroy();
		}).gc('inner');
	}
});

group('many targets multiple relations 5k @relation', () => {
	const RelA = relation();
	const RelB = relation();
	const RelC = relation();
	const RelD = relation();
	const RelE = relation();
	const allRels = [RelA, RelB, RelC, RelD, RelE];

	bench('5 rels, 200 targets, query specific', function* () {
		const world = createWorld();
		const targets: Entity[] = [];
		for (let i = 0; i < 200; i++) {
			targets.push(world.spawn(Position));
		}
		for (let i = 0; i < 5_000; i++) {
			const rel = allRels[i % 5];
			const target = targets[i % 200];
			world.spawn(Position, rel(target));
		}

		const queryTarget = targets[0];
		yield () => {
			world.query(RelA(queryTarget));
		};

		world.destroy();
	}).gc('inner');

	bench('5 rels, 200 targets, query wildcard*', function* () {
		const world = createWorld();
		const targets: Entity[] = [];
		for (let i = 0; i < 200; i++) {
			targets.push(world.spawn(Position));
		}
		for (let i = 0; i < 5_000; i++) {
			const rel = allRels[i % 5];
			const target = targets[i % 200];
			world.spawn(Position, rel(target));
		}

		yield () => {
			world.query(RelA('*'));
		};

		world.destroy();
	}).gc('inner');
});
