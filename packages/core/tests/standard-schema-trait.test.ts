import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld, trait } from '../src';
import type { World } from '../src';
import * as v from 'valibot';

describe('Standard Schema Traits', () => {
	let world: World;

	beforeEach(() => {
		world = createWorld();
	});

	it('should create a trait with a standard schema', () => {
		const schema = v.object({
			name: v.string(),
			age: v.number(),
		});

		const Player = trait(schema);

		expect(Player).toBeDefined();
		expect(Player.id).toBeGreaterThanOrEqual(0);
	});

	it('should add a trait with standard schema to an entity', () => {
		const schema = v.object({
			x: v.number(),
			y: v.number(),
		});

		const Position = trait(schema);
		const entity = world.spawn();

		entity.add(Position({ x: 10, y: 20 }));

		const position = entity.get(Position);
		expect(position).toEqual({ x: 10, y: 20 });
	});

	it('should validate values when setting traits', () => {
		const schema = v.object({
			value: v.pipe(v.number(), v.minValue(0)),
		});

		const Counter = trait(schema);
		const entity = world.spawn(Counter({ value: 5 }));

		// Valid set
		entity.set(Counter, { value: 10 });
		expect(entity.get(Counter)).toEqual({ value: 10 });

		// Invalid set should throw
		expect(() => {
			entity.set(Counter, { value: -1 });
		}).toThrow(/validation failed/i);
	});

	it('should handle schema transformations', () => {
		// Schema with transformation: double the input value
		const schema = v.pipe(
			v.object({
				value: v.number(),
			}),
			v.transform((input) => ({ doubled: input.value * 2 }))
		);

		const Doubler = trait(schema);
		const entity = world.spawn(Doubler({ value: 5 }));

		const result = entity.get(Doubler);
		expect(result).toEqual({ doubled: 10 });
	});

	it('should work with multiple entities', () => {
		const schema = v.object({
			name: v.string(),
		});

		const Name = trait(schema);

		const entity1 = world.spawn(Name({ name: 'Alice' }));
		const entity2 = world.spawn(Name({ name: 'Bob' }));

		expect(entity1.get(Name)).toEqual({ name: 'Alice' });
		expect(entity2.get(Name)).toEqual({ name: 'Bob' });
	});

	it('should support removing standard schema traits', () => {
		const schema = v.object({
			value: v.string(),
		});

		const Tag = trait(schema);
		const entity = world.spawn(Tag({ value: 'test' }));

		expect(entity.get(Tag)).toBeDefined();

		entity.remove(Tag);

		expect(entity.get(Tag)).toBeUndefined();
	});

	it('should reject async validation', () => {
		// Valibot doesn't have async validation in the same way, but we can test
		// with a custom Standard Schema that returns a Promise
		const asyncSchema = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: async (value: unknown) => {
					return { value: value as { value: number } };
				},
			},
		} as any;

		const AsyncTrait = trait(asyncSchema);
		const entity = world.spawn();

		expect(() => {
			entity.add(AsyncTrait({ value: 5 }));
		}).toThrow(/async validation is not supported/i);
	});

	it('should work with complex valibot schemas', () => {
		// Complex real-world example with validation rules (but no nesting)
		const PlayerSchema = v.object({
			name: v.pipe(v.string(), v.minLength(2), v.maxLength(20)),
			health: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
			level: v.pipe(v.number(), v.integer(), v.minValue(1)),
			x: v.number(),
			y: v.number(),
		});

		const Player = trait(PlayerSchema);

		const entity = world.spawn(
			Player({
				name: 'Alice',
				health: 100,
				level: 5,
				x: 10,
				y: 20,
			})
		);

		const player = entity.get(Player);
		expect(player).toEqual({
			name: 'Alice',
			health: 100,
			level: 5,
			x: 10,
			y: 20,
		});

		// Update valid values
		entity.set(Player, {
			name: 'Bob',
			health: 75,
			level: 6,
			x: 15,
			y: 25,
		});

		expect(entity.get(Player)).toEqual({
			name: 'Bob',
			health: 75,
			level: 6,
			x: 15,
			y: 25,
		});

		// Should reject invalid name (too short)
		expect(() => {
			entity.set(Player, {
				name: 'A',
				health: 100,
				level: 1,
				x: 0,
				y: 0,
			});
		}).toThrow(/validation failed/i);

		// Should reject invalid health (out of range)
		expect(() => {
			entity.set(Player, {
				name: 'Alice',
				health: 150,
				level: 1,
				x: 0,
				y: 0,
			});
		}).toThrow(/validation failed/i);
	});

	it('should reject nested objects in standard schemas', () => {
		// Schema with nested object - should be rejected
		const NestedSchema = v.object({
			name: v.string(),
			position: v.object({
				x: v.number(),
				y: v.number(),
			}),
		});

		const NestedTrait = trait(NestedSchema);
		const entity = world.spawn();

		// Should throw when trying to add a trait with nested object
		expect(() => {
			entity.add(
				NestedTrait({
					name: 'Test',
					position: { x: 10, y: 20 },
				})
			);
		}).toThrow(/is an object, which is not supported in traits/);
	});

	it('should reject nested arrays in standard schemas', () => {
		// Schema with array - should be rejected
		const ArraySchema = v.object({
			name: v.string(),
			items: v.array(v.number()),
		});

		const ArrayTrait = trait(ArraySchema);
		const entity = world.spawn();

		// Should throw when trying to add a trait with array
		expect(() => {
			entity.add(
				ArrayTrait({
					name: 'Test',
					items: [1, 2, 3],
				})
			);
		}).toThrow(/is an array, which is not supported in traits/);
	});

	it('should reject nested objects in standard schemas', () => {
		// Schema with array - should be rejected
		const NestedObjectSchema = v.object({
			name: v.string(),
			items: v.object({
				key: v.number()
			}),
		});

		const NestedObjectTrait = trait(NestedObjectSchema);
		const entity = world.spawn();

		// Should throw when trying to add a trait with array
		expect(() => {
			entity.add(
				NestedObjectTrait({
					name: 'Test',
					items: {
						key: 3,
					},
				})
			);
		}).toThrow(/is an object, which is not supported in traits/);
	});
});
