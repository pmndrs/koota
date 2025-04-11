import { $internal } from '../../common';
import { EventType } from '../types';

export function allSubscribersProcessed<T>(eventType: EventType<T>): boolean {
	const ctx = eventType[$internal];
	const queueLength = ctx.queue.length;

	for (const subscriber of ctx.subscribers) {
		if (subscriber.lastReadIndex < queueLength) {
			return false;
		}
	}

	return true;
}
