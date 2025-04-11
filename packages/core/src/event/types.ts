import { $internal } from '../common';

export type EventType<T> = {
	schema: T;
	[$internal]: {
		subscribers: Set<EventSubscriber<T>>;
		queue: T[];
	};
};

export type EventSubscriber<T> = {
	eventType: EventType<T>;
	lastReadIndex: number;
	read(callback: (event: T) => void): void;
};
