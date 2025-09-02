import type { Entity } from '../entity/types';
import type { Trait, TraitData } from '../trait/types';
import { EventEmitter } from '../utils/event-emitter';

// Store update event types
export type StoreUpdateEventType = 'add' | 'remove' | 'change';

export interface StoreUpdateEvent {
	type: StoreUpdateEventType;
	entity: Entity;
	trait: Trait;
	traitData: TraitData;
}

/**
 * Typed event emitter for store update events
 */
export class StoreEventEmitter extends EventEmitter<StoreUpdateEvent> {}
