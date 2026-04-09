import { bench, group } from '@pmndrs/labs';
import { createWorld, relation, trait, type Entity } from 'koota';

const Position = trait({ x: 0, y: 0, z: 0 });
const IsPlayer = trait();
const IsActive = trait();

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

group('relation target filters 10k @relation @query', () => {
	const ChildOf = relation();

	const buildWorld = () => {
		const world = createWorld();
		const parents: Entity[] = [];

		for (let i = 0; i < 100; i++) {
			const traits: any[] = [Position];
			if (i % 2 === 0) traits.push(IsPlayer);
			if (i % 4 === 0) traits.push(IsActive);
			parents.push(world.spawn(...traits));
		}

		for (let i = 0; i < 10_000; i++) {
			world.spawn(Position, ChildOf(parents[i % parents.length]));
		}

		return { world, parents };
	};

	bench('100 parents, query ChildOf(parent)', function* () {
		const { world, parents } = buildWorld();
		yield () => {
			world.query(ChildOf(parents[0]));
		};
		world.destroy();
	}).gc('inner');

	bench('100 parents, query ChildOf(IsPlayer)', function* () {
		const { world } = buildWorld();
		yield () => {
			world.query(ChildOf(IsPlayer));
		};
		world.destroy();
	}).gc('inner');

	bench('100 parents, manual ChildOf(*) filter IsPlayer', function* () {
		const { world } = buildWorld();
		yield () => {
			world.query(ChildOf('*')).filter((child) => child.targetFor(ChildOf)?.has(IsPlayer));
		};
		world.destroy();
	}).gc('inner');

	bench('100 parents, query ChildOf(IsPlayer, IsActive)', function* () {
		const { world } = buildWorld();
		yield () => {
			world.query(ChildOf(IsPlayer, IsActive));
		};
		world.destroy();
	}).gc('inner');

	bench('100 parents, manual ChildOf(*) filter IsPlayer+IsActive', function* () {
		const { world } = buildWorld();
		yield () => {
			world
				.query(ChildOf('*'))
				.filter((child) => {
					const parent = child.targetFor(ChildOf);
					return parent?.has(IsPlayer) && parent?.has(IsActive);
				});
		};
		world.destroy();
	}).gc('inner');
});

group('relation target filter maintenance 2k @relation @query', () => {
	const ChildOf = relation();

	bench('toggle parents with ChildOf(IsPlayer) active', function* () {
		const world = createWorld();
		const parents: Entity[] = [];

		for (let i = 0; i < 200; i++) {
			if (i % 2 === 0) parents.push(world.spawn(Position, IsPlayer));
			else parents.push(world.spawn(Position));
		}

		for (let i = 0; i < 2_000; i++) {
			world.spawn(Position, ChildOf(parents[i % parents.length]));
		}

		world.query(ChildOf(IsPlayer));

		let enabled = false;
		yield () => {
			enabled = !enabled;
			for (let i = 0; i < parents.length; i++) {
				if ((i % 2 === 0) === enabled) parents[i].add(IsPlayer);
				else parents[i].remove(IsPlayer);
			}
		};

		world.destroy();
	}).gc('inner');
});
