import { beforeEach, describe, expect, it } from 'vitest';
import { relation, Wildcard } from '../src/relation/relation';
import { createWorld } from '../src';

describe('Relation', () => {
	const world = createWorld();
	world.init();

	beforeEach(() => {
		world.reset();
	});

	it('should create a relation', () => {
		const Relation = relation();
		expect(Object.keys(Relation)).toEqual([]);
	});

	it('should create a unique relations per target by default', () => {
		const Targeting = relation();
		const Attacking = relation();

		const player = world.spawn();
		const guard = world.spawn();
		const goblin = world.spawn(Targeting(player), Attacking(guard), Targeting(guard));

		let targets = world.getTargets(Targeting, goblin);
		expect(targets.length).toBe(2);
		expect(targets).toContain(player);
		expect(targets).toContain(guard);

		targets = world.getTargets(Attacking, goblin);
		expect(targets.length).toBe(1);
		expect(targets).toContain(guard);
	});

	it('should maintain exclusive relations', () => {
		const Targeting = relation({ exclusive: true });

		const player = world.spawn();
		const guard = world.spawn();
		const goblin = world.spawn(Targeting(player));

		let targets = world.getTargets(Targeting, goblin);

		expect(targets.length).toBe(1);
		expect(targets[0]).toBe(player);
		expect(goblin.has(Targeting(player))).toBe(true);

		goblin.add(Targeting(guard));
		targets = world.getTargets(Targeting, goblin);

		expect(targets.length).toBe(1);
		expect(targets[0]).toBe(guard);
		expect(goblin.has(Targeting(player))).toBe(false);
		expect(goblin.has(Targeting(guard))).toBe(true);

		goblin.add(Targeting(player));
		targets = world.getTargets(Targeting, goblin);

		expect(targets.length).toBe(1);
		expect(targets[0]).toBe(player);
		expect(goblin.has(Targeting(player))).toBe(true);
		expect(goblin.has(Targeting(guard))).toBe(false);
	});

	it('should auto remove target and its descendants', () => {
		const ChildOf = relation({ autoRemoveTarget: true });

		const parent = world.spawn();
		const child = world.spawn(ChildOf(parent));

		const childChildA = world.spawn(ChildOf(child));
		const childChildB = world.spawn(ChildOf(child));
		const childChildC = world.spawn(ChildOf(childChildB));

		expect(world.has(parent)).toBe(true);
		expect(world.has(child)).toBe(true);
		expect(world.has(childChildA)).toBe(true);
		expect(world.has(childChildB)).toBe(true);
		expect(world.has(childChildC)).toBe(true);

		parent.destroy();

		expect(world.has(parent)).toBe(false);
		expect(world.has(child)).toBe(false);
		expect(world.has(childChildA)).toBe(false);
		expect(world.has(childChildB)).toBe(false);
		expect(world.has(childChildC)).toBe(false);
	});

	it('should create stores for relations', () => {
		const Contains = relation({ store: { amount: 0 } });

		const inventory = world.spawn();
		const gold = world.spawn();
		const silver = world.spawn();

		inventory.add(Contains(gold));
		const goldStore = world.getStore(Contains(gold));
		const silverStore = world.getStore(Contains(silver));
		goldStore.amount[inventory] = 5;

		inventory.add(Contains(silver));
		silverStore.amount[inventory] = 12;

		expect(Contains(gold)).not.toBe(Contains(silver));
		expect(goldStore.amount[inventory]).toBe(5);
		expect(silverStore.amount[inventory]).toBe(12);
		expect(world.getStore(Contains(gold)).amount[inventory]).toBe(5);
		expect(world.getStore(Contains(silver)).amount[inventory]).toBe(12);
	});

	it('should query all relations with a wildcard', () => {
		const Contains = relation();

		const inventory = world.spawn();
		const shop = world.spawn();
		const gold = world.spawn();
		const silver = world.spawn();

		inventory.add(Contains(gold));
		inventory.add(Contains(silver));

		let relations = world.query(Contains('*'));
		expect(relations.length).toBe(1);
		expect(relations).toContain(inventory);

		shop.add(Contains(gold));

		relations = world.query(Contains('*'));
		expect(relations.length).toBe(2);
		expect(relations).toContain(inventory);
		expect(relations).toContain(shop);
	});
});
