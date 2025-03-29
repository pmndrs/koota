import { $internal } from '../common';
import { EventType, EventSubscriber } from './types';
import { checkForCleanup } from './utils/check-for-cleanup';

export function createSubscriber<T>(eventType: EventType<T>): EventSubscriber<T> {
	const subscriber: EventSubscriber<T> = {
		eventType,
		lastReadIndex: 0,
		read(callback: (event: T) => void) {
			const events = eventType[$internal].queue;

			if (this.lastReadIndex < events.length) {
				for (let i = this.lastReadIndex; i < events.length; i++) {
					callback(events[i]);
				}

				this.lastReadIndex = events.length;
			}

			checkForCleanup(eventType);
		},
	};

	eventType[$internal].subscribers.add(subscriber);

	return subscriber;
}
