import type { Entity, World } from 'koota';
import { NetID } from '../traits';

/**
 * Bidirectional mapping between network IDs and entities.
 */
export interface NetIdMap {
	toEntity: Map<string, Entity>;
	toNetId: Map<Entity, string>;
}

export function createNetIdMap(): NetIdMap {
	return {
		toEntity: new Map(),
		toNetId: new Map(),
	};
}

/**
 * Registers automatic NetID mapping via world events.
 * Call once per world to set up bidirectional sync.
 */
export function registerNetIdMapping(world: World, netIds: NetIdMap): () => void {
	const unsubAdd = world.onAdd(NetID, (entity) => {
		const { id } = entity.get(NetID)!;
		if (id) {
			netIds.toEntity.set(id, entity);
			netIds.toNetId.set(entity, id);
		}
	});

	const unsubRemove = world.onRemove(NetID, (entity) => {
		const id = netIds.toNetId.get(entity);
		if (id) {
			netIds.toEntity.delete(id);
			netIds.toNetId.delete(entity);
		}
	});

	return () => {
		unsubAdd();
		unsubRemove();
	};
}
