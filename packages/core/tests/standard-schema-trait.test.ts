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

		entity.set(Counter, { value: 10 });
		expect(entity.get(Counter)).toEqual({ value: 10 });

		expect(() => {
			entity.set(Counter, { value: -1 });
		}).toThrow(/validation failed/i);
	});

	it('should validate values when setting fields directly', () => {
		const schema = v.object({
			value: v.pipe(v.number(), v.minValue(0)),
		});

		const Counter = trait(schema);
		const entity = world.spawn(Counter({ value: 5 }));

		// Direct field mutation should trigger validation
		expect(() => {
			world.query(Counter).updateEach(([counter]: [{ value: number }]) => {
				counter.value = -1;
			});
		}).toThrow(/validation failed/i);

		// Value should remain unchanged after failed validation
		expect(entity.get(Counter)).toEqual({ value: 5 });

		// Valid mutation should work
		world.query(Counter).updateEach(([counter]: [{ value: number }]) => {
			counter.value = 10;
		});
		expect(entity.get(Counter)).toEqual({ value: 10 });
	});

	it('should handle schema with default values', () => {
		const schema = v.object({
			value: v.optional(v.number(), 10),
			name: v.string(),
		});

		const Config = trait(schema);
		const entity = world.spawn(Config({ name: 'test' }));

		const result = entity.get(Config);
		expect(result).toEqual({ value: 10, name: 'test' });
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
		const schema = v.object({
			name: v.pipe(v.string(), v.minLength(2), v.maxLength(20)),
			health: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
			level: v.pipe(v.number(), v.integer(), v.minValue(1)),
			x: v.number(),
			y: v.number(),
		});

		const Player = trait(schema);

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

		// Should reject too short name
		expect(() => {
			entity.set(Player, {
				name: 'A',
				health: 100,
				level: 1,
				x: 0,
				y: 0,
			});
		}).toThrow(/validation failed/i);

		// Should reject out-of-range health
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
		const schema = v.object({
			name: v.string(),
			position: v.object({
				x: v.number(),
				y: v.number(),
			}),
		});

		const NestedTrait = trait(schema);
		const entity = world.spawn();

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
		const schema = v.object({
			name: v.string(),
			items: v.array(v.number()),
		});

		const ArrayTrait = trait(schema);
		const entity = world.spawn();

		expect(() => {
			entity.add(
				ArrayTrait({
					name: 'Test',
					items: [1, 2, 3],
				})
			);
		}).toThrow(/is an array, which is not supported in traits/);
	});

	it('should validate string constraints with direct updates', () => {
		const schema = v.object({
			name: v.pipe(v.string(), v.minLength(3)),
		});

		const Name = trait(schema);
		const entity = world.spawn(Name({ name: 'Alice' }));

		expect(() => {
			world.query(Name).updateEach(([data]: [{ name: string }]) => {
				data.name = 'AB';
			});
		}).toThrow(/validation failed/i);

		expect(entity.get(Name)).toEqual({ name: 'Alice' });

		world.query(Name).updateEach(([data]: [{ name: string }]) => {
			data.name = 'Bob';
		});
		expect(entity.get(Name)).toEqual({ name: 'Bob' });
	});

	it('should validate multiple fields with direct updates', () => {
		const schema = v.object({
			x: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
			y: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
		});

		const Position = trait(schema);
		const entity = world.spawn(Position({ x: 50, y: 50 }));

		expect(() => {
			world.query(Position).updateEach(([pos]: [{ x: number; y: number }]) => {
				pos.x = 150;
			});
		}).toThrow(/validation failed/i);

		expect(entity.get(Position)).toEqual({ x: 50, y: 50 });

		world.query(Position).updateEach(([pos]: [{ x: number; y: number }]) => {
			pos.x = 75;
			pos.y = 25;
		});
		expect(entity.get(Position)).toEqual({ x: 75, y: 25 });
	});

	it('should validate across multiple entities with direct updates', () => {
		const schema = v.object({
			health: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
		});

		const Health = trait(schema);
		const entity1 = world.spawn(Health({ health: 100 }));
		const entity2 = world.spawn(Health({ health: 50 }));

		expect(() => {
			world.query(Health).updateEach(([health]: [{ health: number }]) => {
				health.health = -10;
			});
		}).toThrow(/validation failed/i);

		expect(entity1.get(Health)).toEqual({ health: 100 });
		expect(entity2.get(Health)).toEqual({ health: 50 });

		world.query(Health).updateEach(([health]: [{ health: number }]) => {
			health.health = Math.max(0, health.health - 10);
		});

		expect(entity1.get(Health)).toEqual({ health: 90 });
		expect(entity2.get(Health)).toEqual({ health: 40 });
	});
});
