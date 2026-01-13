import type { World } from 'koota';
import { NetID, ShapeType, Position, Rotation, Scale, Color } from '../traits';
import type { NetIdMap } from './net-id-map';
import type {
	Op,
	OpType,
	SpawnShapePayload,
	DeleteShapePayload,
	SetPositionPayload,
	SetRotationPayload,
	SetScalePayload,
	SetColorPayload,
} from './protocol';

/**
 * Op definition interface.
 * Each op type has an apply function and an invert function.
 */
export interface OpDef<T> {
	apply: (world: World, netIds: NetIdMap, payload: T, netId: string) => void;
	invert: (world: World, netIds: NetIdMap, payload: T, netId: string) => Op | null;
	property?: string; // For anti-flicker conflict key
}

/**
 * Op definitions for all supported operations.
 */
export const opDefs: Record<OpType, OpDef<any>> = {
	spawnShape: {
		apply(world: World, netIds: NetIdMap, payload: SpawnShapePayload) {
			// Check if already exists (idempotent)
			if (netIds.toEntity.has(payload.netId)) return;

			const entity = world.spawn(
				NetID({ id: payload.netId }),
				ShapeType({ type: payload.shapeType }),
				Position(payload.position),
				Rotation(payload.rotation),
				Scale(payload.scale),
				Color({ value: payload.color })
			);
			netIds.toEntity.set(payload.netId, entity);
			netIds.toNetId.set(entity, payload.netId);
		},
		invert(_world: World, _netIds: NetIdMap, payload: SpawnShapePayload): Op {
			return {
				id: '',
				type: 'deleteShape',
				netId: payload.netId,
				payload: {
					shapeType: payload.shapeType,
					position: payload.position,
					rotation: payload.rotation,
					scale: payload.scale,
					color: payload.color,
				},
				clientSeq: 0,
				clientId: '',
				timestamp: 0,
			};
		},
	},

	deleteShape: {
		apply(_world: World, netIds: NetIdMap, _payload: DeleteShapePayload, netId: string) {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return;
			netIds.toEntity.delete(netId);
			netIds.toNetId.delete(entity);
			entity.destroy();
		},
		invert(_world: World, _netIds: NetIdMap, payload: DeleteShapePayload, netId: string): Op | null {
			if (!payload.shapeType) return null;
			return {
				id: '',
				type: 'spawnShape',
				netId,
				payload: {
					netId,
					shapeType: payload.shapeType,
					position: payload.position!,
					rotation: payload.rotation!,
					scale: payload.scale!,
					color: payload.color!,
				},
				clientSeq: 0,
				clientId: '',
				timestamp: 0,
			};
		},
	},

	setPosition: {
		property: 'position',
		apply(_world: World, netIds: NetIdMap, payload: SetPositionPayload, netId: string) {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return;
			entity.set(Position, payload);
		},
		invert(_world: World, netIds: NetIdMap, _payload: SetPositionPayload, netId: string): Op | null {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return null;
			const prev = entity.get(Position);
			if (!prev) return null;
			return {
				id: '',
				type: 'setPosition',
				netId,
				payload: { x: prev.x, y: prev.y, z: prev.z },
				clientSeq: 0,
				clientId: '',
				timestamp: 0,
			};
		},
	},

	setRotation: {
		property: 'rotation',
		apply(_world: World, netIds: NetIdMap, payload: SetRotationPayload, netId: string) {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return;
			entity.set(Rotation, payload);
		},
		invert(_world: World, netIds: NetIdMap, _payload: SetRotationPayload, netId: string): Op | null {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return null;
			const prev = entity.get(Rotation);
			if (!prev) return null;
			return {
				id: '',
				type: 'setRotation',
				netId,
				payload: { x: prev.x, y: prev.y, z: prev.z, w: prev.w },
				clientSeq: 0,
				clientId: '',
				timestamp: 0,
			};
		},
	},

	setScale: {
		property: 'scale',
		apply(_world: World, netIds: NetIdMap, payload: SetScalePayload, netId: string) {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return;
			entity.set(Scale, payload);
		},
		invert(_world: World, netIds: NetIdMap, _payload: SetScalePayload, netId: string): Op | null {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return null;
			const prev = entity.get(Scale);
			if (!prev) return null;
			return {
				id: '',
				type: 'setScale',
				netId,
				payload: { x: prev.x, y: prev.y, z: prev.z },
				clientSeq: 0,
				clientId: '',
				timestamp: 0,
			};
		},
	},

	setColor: {
		property: 'color',
		apply(_world: World, netIds: NetIdMap, payload: SetColorPayload, netId: string) {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return;
			entity.set(Color, { value: payload.value });
		},
		invert(_world: World, netIds: NetIdMap, _payload: SetColorPayload, netId: string): Op | null {
			const entity = netIds.toEntity.get(netId);
			if (!entity || !entity.isAlive()) return null;
			const prev = entity.get(Color);
			if (!prev) return null;
			return {
				id: '',
				type: 'setColor',
				netId,
				payload: { value: prev.value },
				clientSeq: 0,
				clientId: '',
				timestamp: 0,
			};
		},
	},
};

/**
 * Get conflict key for anti-flicker logic.
 * Returns null for structural ops (spawn/delete).
 */
export function getConflictKey(op: Op): string | null {
	const def = opDefs[op.type];
	if (def.property) {
		return `${op.netId}:${def.property}`;
	}
	return null;
}

/**
 * Capture full entity state for undo of delete operations.
 */
export function captureEntityState(
	netIds: NetIdMap,
	netId: string
): DeleteShapePayload | null {
	const entity = netIds.toEntity.get(netId);
	if (!entity || !entity.isAlive()) return null;

	const shapeType = entity.get(ShapeType);
	const position = entity.get(Position);
	const rotation = entity.get(Rotation);
	const scale = entity.get(Scale);
	const color = entity.get(Color);

	if (!shapeType || !position || !rotation || !scale || !color) return null;

	return {
		shapeType: shapeType.type,
		position: { x: position.x, y: position.y, z: position.z },
		rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
		scale: { x: scale.x, y: scale.y, z: scale.z },
		color: color.value,
	};
}
