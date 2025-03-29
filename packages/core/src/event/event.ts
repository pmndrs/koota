import { $internal } from '../common';
import { EventSubscriber, EventType } from './types';

export function createEvent<T extends Record<string, any>>(schema: T): EventType<T> {
	const eventType: EventType<T> = {
		schema,
		[$internal]: {
			subscribers: new Set<EventSubscriber<T>>(),
			queue: [],
		},
	};

	return eventType;
}

export function destroyEvent<T>(eventType: EventType<T>): void {
	const ctx = eventType[$internal];
	ctx.queue.length = 0;
	ctx.subscribers.clear();
}
