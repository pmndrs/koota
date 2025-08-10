export type EventListener<T = any> = (event: T) => void;

/**
 * Generic event emitter that can handle any event type with proper typing
 */
export class EventEmitter<T = any> {
	private listeners: EventListener<T>[] = [];

	/**
	 * Subscribe to events
	 */
	on(listener: EventListener<T>): void {
		this.listeners.push(listener);
	}

	/**
	 * Unsubscribe from events
	 */
	off(listener: EventListener<T>): void {
		const index = this.listeners.indexOf(listener);
		if (index !== -1) {
			this.listeners.splice(index, 1);
		}
	}

	/**
	 * Emit an event to all listeners
	 */
	emit(event: T): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	/**
	 * Clear all listeners
	 */
	clear(): void {
		this.listeners.length = 0;
	}

	/**
	 * Get the number of listeners
	 */
	get listenerCount(): number {
		return this.listeners.length;
	}

	/**
	 * Check if there are any listeners
	 */
	get hasListeners(): boolean {
		return this.listeners.length > 0;
	}
}
