import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, Entity } from '../src';
import { $internal } from '../src/common';

describe('Event System', () => {
	const world = createWorld();

	beforeEach(() => {
		world.reset();
	});

	describe('Event Creation', () => {
		it('should create an event type with the specified schema', () => {
			const TestEvent = world.createEvent({ value: 0 });

			expect(TestEvent.schema).toEqual({ value: 0 });
			expect(TestEvent[$internal].subscribers.size).toBe(0);
			expect(TestEvent[$internal].queue.length).toBe(0);
		});

		it('should register the event type with the world', () => {
			const TestEvent = world.createEvent({ value: 0 });

			expect(world[$internal].eventTypes.has(TestEvent)).toBe(true);
		});
	});

	describe('Event Subscription', () => {
		it('should create a subscriber for an event type', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber = world.createSubscriber(TestEvent);

			expect(subscriber.eventType).toBe(TestEvent);
			expect(subscriber.lastReadIndex).toBe(0);
			expect(TestEvent[$internal].subscribers.has(subscriber)).toBe(true);
		});

		it('should throw when creating a subscriber for an event from another world', () => {
			const world2 = createWorld();
			const TestEvent = world2.createEvent({ value: 0 });

			expect(() => {
				world.createSubscriber(TestEvent);
			}).toThrow();

			world2.destroy();
		});

		it('should allow multiple subscribers for the same event type', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber1 = world.createSubscriber(TestEvent);
			const subscriber2 = world.createSubscriber(TestEvent);

			expect(TestEvent[$internal].subscribers.size).toBe(2);
			expect(TestEvent[$internal].subscribers.has(subscriber1)).toBe(true);
			expect(TestEvent[$internal].subscribers.has(subscriber2)).toBe(true);
		});
	});

	describe('Event Emission', () => {
		it('should emit events to the queue', () => {
			const TestEvent = world.createEvent({ value: 0 });

			world.emit(TestEvent, { value: 42 });

			expect(TestEvent[$internal].queue.length).toBe(1);
			expect(TestEvent[$internal].queue[0]).toEqual({ value: 42 });
		});

		it('should clone the event data when emitting', () => {
			const TestEvent = world.createEvent({ value: 0 });

			const originalData = { value: 42 };
			world.emit(TestEvent, originalData);

			// Modify original data
			originalData.value = 99;

			// Queue should have the cloned value
			expect(TestEvent[$internal].queue[0].value).toBe(42);
		});

		it('should throw when emitting an event from another world', () => {
			const world2 = createWorld();
			const TestEvent = world2.createEvent({ value: 0 });

			expect(() => {
				world.emit(TestEvent, { value: 42 });
			}).toThrow();

			world2.destroy();
		});
	});

	describe('Event Reading', () => {
		it('should allow subscribers to read events', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 42 });

			const mock = vi.fn();
			subscriber.read(mock);

			expect(mock).toHaveBeenCalledTimes(1);
			expect(mock).toHaveBeenCalledWith({ value: 42 });
		});

		it('should handle multiple events in queue', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 1 });
			world.emit(TestEvent, { value: 2 });
			world.emit(TestEvent, { value: 3 });

			const mock = vi.fn();
			subscriber.read(mock);

			expect(mock).toHaveBeenCalledTimes(3);
			expect(mock).toHaveBeenNthCalledWith(1, { value: 1 });
			expect(mock).toHaveBeenNthCalledWith(2, { value: 2 });
			expect(mock).toHaveBeenNthCalledWith(3, { value: 3 });
		});

		it('should only provide new events on subsequent reads', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 1 });

			const mock = vi.fn();
			subscriber.read(mock);

			expect(mock).toHaveBeenCalledTimes(1);
			expect(mock).toHaveBeenCalledWith({ value: 1 });

			world.emit(TestEvent, { value: 2 });

			subscriber.read(mock);

			expect(mock).toHaveBeenCalledTimes(2);
			expect(mock).toHaveBeenLastCalledWith({ value: 2 });
		});

		it('should not call the callback if there are no events', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber = world.createSubscriber(TestEvent);

			const mock = vi.fn();
			subscriber.read(mock);

			expect(mock).not.toHaveBeenCalled();

			world.emit(TestEvent, { value: 1 });
			subscriber.read(mock);

			expect(mock).toHaveBeenCalledTimes(1);
			expect(mock).toHaveBeenCalledWith({ value: 1 });

			subscriber.read(mock);

			expect(mock).toHaveBeenCalledTimes(1);
		});

		it('should deliver events independently to multiple subscribers', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber1 = world.createSubscriber(TestEvent);
			const subscriber2 = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 42 });

			const mock1 = vi.fn();
			const mock2 = vi.fn();

			subscriber1.read(mock1);
			subscriber2.read(mock2);

			expect(mock1).toHaveBeenCalledTimes(1);
			expect(mock1).toHaveBeenCalledWith({ value: 42 });
			expect(mock2).toHaveBeenCalledTimes(1);
			expect(mock2).toHaveBeenCalledWith({ value: 42 });
		});
	});

	describe('Event Cleanup', () => {
		it('should keep events until all subscribers have read them', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber1 = world.createSubscriber(TestEvent);
			const subscriber2 = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 42 });

			// First subscriber reads
			subscriber1.read(() => {});

			// Events should still be in queue
			expect(TestEvent[$internal].queue.length).toBe(1);

			// Second subscriber reads
			subscriber2.read(() => {});

			// Now events should be cleared
			expect(TestEvent[$internal].queue.length).toBe(0);
		});

		it('should reset lastReadIndex when queue is cleared', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber1 = world.createSubscriber(TestEvent);
			const subscriber2 = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 42 });

			subscriber1.read(() => {});

			expect(subscriber1.lastReadIndex).toBe(1);

			subscriber2.read(() => {});

			expect(subscriber1.lastReadIndex).toBe(0);
			expect(subscriber2.lastReadIndex).toBe(0);
		});
	});

	describe('World Integration', () => {
		it('should clean up all events when world is reset', () => {
			const TestEvent = world.createEvent({ value: 0 });
			const subscriber = world.createSubscriber(TestEvent);

			world.emit(TestEvent, { value: 42 });

			world.reset();

			expect(TestEvent[$internal].queue.length).toBe(0);
			expect(TestEvent[$internal].subscribers.size).toBe(0);
			expect(world[$internal].eventTypes.size).toBe(0);
		});
	});
});
