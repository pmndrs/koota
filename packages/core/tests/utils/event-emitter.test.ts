import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../src/utils/event-emitter';

interface TestEvent {
	type: string;
	data: number;
}

describe('EventEmitter', () => {
	let emitter: EventEmitter<TestEvent>;

	beforeEach(() => {
		emitter = new EventEmitter<TestEvent>();
	});

	it('should emit events to listeners', () => {
		const listener1 = vi.fn();
		const listener2 = vi.fn();
		const event: TestEvent = { type: 'test', data: 42 };

		emitter.on(listener1);
		emitter.on(listener2);
		emitter.emit(event);

		expect(listener1).toHaveBeenCalledWith(event);
		expect(listener2).toHaveBeenCalledWith(event);
		expect(emitter.listenerCount).toBe(2);
	});

	it('should remove listeners', () => {
		const listener = vi.fn();
		const event: TestEvent = { type: 'test', data: 42 };

		emitter.on(listener);
		emitter.off(listener);
		emitter.emit(event);

		expect(listener).not.toHaveBeenCalled();
		expect(emitter.listenerCount).toBe(0);
	});

	it('should clear all listeners', () => {
		const listener1 = vi.fn();
		const listener2 = vi.fn();

		emitter.on(listener1);
		emitter.on(listener2);
		emitter.clear();

		expect(emitter.listenerCount).toBe(0);
		expect(emitter.hasListeners).toBe(false);
	});

	it('should handle empty emitter', () => {
		const event: TestEvent = { type: 'test', data: 42 };

		expect(() => emitter.emit(event)).not.toThrow();
		expect(emitter.hasListeners).toBe(false);
	});
});
