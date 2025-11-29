import { beforeEach, describe, expect, it } from 'vitest';
import { $internal, createChanged, createWorld, Not, relation, trait } from '../src';

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

		let targets = goblin.targetsFor(Targeting);
		expect(targets.length).toBe(2);
		expect(targets).toContain(player);
		expect(targets).toContain(guard);

		targets = goblin.targetsFor(Attacking);
		expect(targets.length).toBe(1);
		expect(targets).toContain(guard);
	});

	it('should maintain exclusive relations', () => {
		const Targeting = relation({ exclusive: true });

		const player = world.spawn();
		const guard = world.spawn();
		const goblin = world.spawn(Targeting(player));

		let target = goblin.targetFor(Targeting);

		expect(target).toBe(player);
		expect(goblin.has(Targeting(player))).toBe(true);

		goblin.add(Targeting(guard));
		target = goblin.targetFor(Targeting);

		expect(target).toBe(guard);
		expect(goblin.has(Targeting(player))).toBe(false);
		expect(goblin.has(Targeting(guard))).toBe(true);

		goblin.add(Targeting(player));
		target = goblin.targetFor(Targeting);

		expect(target).toBe(player);
		expect(goblin.has(Targeting(player))).toBe(true);
		expect(goblin.has(Targeting(guard))).toBe(false);

		// Remove the target and check if the target is removed
		goblin.remove(Targeting(player));
		target = goblin.targetFor(Targeting);

		expect(target).toBe(undefined);
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

		// Can add with initial values
		inventory.add(Contains(gold, { amount: 5 }));

		// Or add and set later
		inventory.add(Contains(silver));
		inventory.set(Contains(silver), { amount: 12 });

		expect(Contains(gold)).not.toBe(Contains(silver));
		expect(inventory.get(Contains(gold))!.amount).toBe(5);
		expect(inventory.get(Contains(silver))!.amount).toBe(12);
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

		// Wildcard '*' should return all entities with Contains relation
		relations = world.query(Contains('*'));
		expect(relations.length).toBe(2);
		expect(relations).toContain(inventory);
		expect(relations).toContain(shop);
	});

	it('should query a specific relation targeting an entity', () => {
		const ChildOf = relation();

		const root = world.spawn();
		const child1 = world.spawn(ChildOf(root));
		const child2 = world.spawn(ChildOf(root));
		const leaf = world.spawn(ChildOf(child2));

		const childrenOfRoot = world.query(ChildOf(root));
		const childrenOfChild2 = world.query(ChildOf(child2));

		expect(childrenOfRoot.length).toBe(2);
		expect(childrenOfRoot).toContain(child1);
		expect(childrenOfRoot).toContain(child2);

		expect(childrenOfChild2.length).toBe(1);
		expect(childrenOfChild2).toContain(leaf);
	});

	it('should correctly remove targets when they are destroyed', () => {
		const Likes = relation();

		const person = world.spawn();
		const apple = world.spawn();
		const banana = world.spawn();
		const cherry = world.spawn();
		const durian = world.spawn();

		// Add multiple relations with different targets
		person.add(Likes(apple));
		person.add(Likes(banana));
		person.add(Likes(cherry));
		person.add(Likes(durian));

		// Check that targetsFor returns all targets
		const initialTargets = person.targetsFor(Likes);
		expect(initialTargets.length).toBe(4);
		expect(initialTargets).toContain(apple);
		expect(initialTargets).toContain(banana);
		expect(initialTargets).toContain(cherry);
		expect(initialTargets).toContain(durian);

		// Destroy some of the targets
		banana.destroy();
		durian.destroy();

		// Check that targetsFor no longer includes the destroyed targets
		const remainingTargets = person.targetsFor(Likes);
		expect(remainingTargets.length).toBe(2);
		expect(remainingTargets).toContain(apple);
		expect(remainingTargets).toContain(cherry);
		expect(remainingTargets).not.toContain(banana);
		expect(remainingTargets).not.toContain(durian);

		// Verify that the destroyed entities are actually gone
		expect(world.has(banana)).toBe(false);
		expect(world.has(durian)).toBe(false);
		expect(world.has(apple)).toBe(true);
		expect(world.has(cherry)).toBe(true);
	});

	it('should remove all relations with a wildcard', () => {
		const Likes = relation();

		const person = world.spawn();
		const apple = world.spawn();
		const banana = world.spawn();

		person.add(Likes(apple));
		person.add(Likes(banana));

		person.remove(Likes('*'));

		expect(person.has(Likes(apple))).toBe(false);
		expect(person.has(Likes(banana))).toBe(false);
	});

	it('should keep wildcard trait when removing one of multiple relations to the same target', () => {
		const Likes = relation();
		const Fears = relation();

		const person = world.spawn();
		const dragon = world.spawn();

		// Person both likes and fears the dragon
		person.add(Likes(dragon));
		person.add(Fears(dragon));

		// Person should have both relations
		expect(person.has(Fears(dragon))).toBe(true);
		expect(person.has(Likes(dragon))).toBe(true);

		// Remove only the Likes relation
		person.remove(Likes(dragon));

		// Person should still fear the dragon
		expect(person.has(Fears(dragon))).toBe(true);
		expect(person.has(Likes(dragon))).toBe(false);
	});

	it('should ignore data on re-add', () => {
		const Contains = relation({ store: { amount: 0 } });
		const container = world.spawn();
		const item = world.spawn();

		container.add(Contains(item, { amount: 5 }));
		expect(container.get(Contains(item))?.amount).toBe(5);

		// Re-adding with different data should be ignored
		container.add(Contains(item, { amount: 10 }));
		expect(container.get(Contains(item))?.amount).toBe(5);
	});

	// There is a hotpath for relation-only queries so this is a sanity check
	it('should support relation-only query with updateEach', () => {
		const ChildOf = relation();

		const parent = world.spawn();
		const child1 = world.spawn(ChildOf(parent));
		const child2 = world.spawn(ChildOf(parent));
		const child3 = world.spawn(ChildOf(parent));

		const visited: number[] = [];

		// updateEach should work but with empty state array
		world.query(ChildOf(parent)).updateEach((state, entity, index) => {
			expect(state).toEqual([]);
			visited.push(entity);
			expect(index).toBe(visited.length - 1);
		});

		expect(visited.length).toBe(3);
		expect(visited).toContain(child1);
		expect(visited).toContain(child2);
		expect(visited).toContain(child3);
	});

	it('queries should support relations with modifiers and traits', () => {
		const ChildOf = relation();
		const Weapon = trait();

		const parent = world.spawn();
		const child1 = world.spawn(ChildOf(parent), Weapon); // Has weapon
		const child2 = world.spawn(ChildOf(parent)); // No weapon

		// Query for children WITHOUT weapon
		let result = world.query(ChildOf(parent), Not(Weapon));

		expect(result.length).toBe(1);
		expect(result).toContain(child2);
		expect(result).not.toContain(child1);

		result = world.query(ChildOf(parent), Weapon);
		expect(result.length).toBe(1);
		expect(result).toContain(child1);
		expect(result).not.toContain(child2);
	});

	it('should track Changed modifier for relation stores', () => {
		const Changed = createChanged();
		const ChildOf = relation({ store: { order: 0 } });
		// Get the base trait from the relation
		const ChildOfTrait = ChildOf[$internal].trait;

		const parent = world.spawn();
		const child1 = world.spawn(ChildOf(parent));
		const child2 = world.spawn(ChildOf(parent));

		// This tracks changes to ChildOf relation store for entities related to parent
		let changedEntities = world.query(Changed(ChildOfTrait), ChildOf(parent));
		expect(changedEntities.length).toBe(0);

		// Update relation store for child1
		child1.set(ChildOf(parent), { order: 1 });

		// Query should now include child1
		changedEntities = world.query(Changed(ChildOfTrait), ChildOf(parent));
		expect(changedEntities.length).toBe(1);
		expect(changedEntities).toContain(child1);
		expect(changedEntities).not.toContain(child2);

		// Verify the order was updated
		expect(child1.get(ChildOf(parent))?.order).toBe(1);
		expect(child2.get(ChildOf(parent))?.order).toBe(0);

		// After query, changes are reset
		changedEntities = world.query(Changed(ChildOfTrait), ChildOf(parent));
		expect(changedEntities.length).toBe(0);

		// Update both children
		child1.set(ChildOf(parent), { order: 2 });
		child2.set(ChildOf(parent), { order: 3 });

		// Both should be in the query
		changedEntities = world.query(Changed(ChildOfTrait), ChildOf(parent));
		expect(changedEntities.length).toBe(2);
		expect(changedEntities).toContain(child1);
		expect(changedEntities).toContain(child2);
	});
});
