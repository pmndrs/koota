import { $internal } from '../../common';
import { EventType } from '../types';
import { allSubscribersProcessed } from './all-subscribers-processed';

export function checkForCleanup<T>(eventType: EventType<T>): void {
	const ctx = eventType[$internal];

	if (allSubscribersProcessed(eventType)) {
		ctx.queue.length = 0;

		for (const sub of ctx.subscribers) {
			sub.lastReadIndex = 0;
		}
	}
}
