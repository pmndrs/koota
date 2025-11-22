import type { Entity } from '../entity/types';

// ---- Types -----------------------------------------------------------------

export type TraitId = number;

// ---- Opcodes (no enums) ----------------------------------------------------

export const OP_SPAWN_ENTITY = 1;
export const OP_DESTROY_ENTITY = 2;
export const OP_ADD_TRAIT = 3;
export const OP_SET_TRAIT = 4;
export const OP_REMOVE_TRAIT = 5;
export const OP_MARK_TRAIT_CHANGE = 6;

export interface CommandBuffer {
	data: Int32Array; // packed opcodes + payload words
	write: number; // next free word index
	values: unknown[]; // arbitrary payloads for SetTrait
}

export interface CommandHandlers {
	spawnEntity(e: Entity): void;
	destroyEntity(e: Entity): void;
	addTrait(e: Entity, t: TraitId): void;
	setTrait(e: Entity, t: TraitId, v: unknown): void;
	removeTrait(e: Entity, t: TraitId): void;
	markTraitChanged(e: Entity, t: TraitId): void;
}

// ---- Buffer creation / reset ----------------------------------------------

export function createCommandBuffer(initialWords = 1024): CommandBuffer {
	return {
		data: new Int32Array(initialWords),
		write: 0,
		values: [],
	};
}

export function clearCommandBuffer(buf: CommandBuffer): void {
	buf.write = 0;
	buf.values.length = 0;
}

// ---- Internal: ensure capacity --------------------------------------------

function ensureCapacity(buf: CommandBuffer, extraWords: number): void {
	const needed = buf.write + extraWords;
	if (needed <= buf.data.length) return;

	const nextSize = Math.max(needed, buf.data.length << 1);
	const next = new Int32Array(nextSize);
	next.set(buf.data);
	buf.data = next;
}

// ---- Recording commands ---------------------------------------------------

// SpawnEntity [ op, entity ]
export function cmdSpawnEntity(buf: CommandBuffer, entity: Entity): void {
	ensureCapacity(buf, 2);
	const d = buf.data;
	let w = buf.write;
	d[w++] = OP_SPAWN_ENTITY;
	d[w++] = entity;
	buf.write = w;
}

// DestroyEntity [ op, entity ]
export function cmdDestroyEntity(buf: CommandBuffer, entity: Entity): void {
	ensureCapacity(buf, 2);
	const d = buf.data;
	let w = buf.write;
	d[w++] = OP_DESTROY_ENTITY;
	d[w++] = entity;
	buf.write = w;
}

// AddTrait [ op, entity, traitId ]
export function cmdAddTrait(buf: CommandBuffer, entity: Entity, traitId: TraitId): void {
	ensureCapacity(buf, 3);
	const d = buf.data;
	let w = buf.write;
	d[w++] = OP_ADD_TRAIT;
	d[w++] = entity;
	d[w++] = traitId;
	buf.write = w;
}

// SetTrait [ op, entity, traitId, valueIndex ]
export function cmdSetTrait(
	buf: CommandBuffer,
	entity: Entity,
	traitId: TraitId,
	value: unknown
): void {
	const valueIndex = buf.values.length;
	buf.values.push(value);
	ensureCapacity(buf, 4);
	const d = buf.data;
	let w = buf.write;
	d[w++] = OP_SET_TRAIT;
	d[w++] = entity;
	d[w++] = traitId;
	d[w++] = valueIndex;
	buf.write = w;
}

// RemoveTrait [ op, entity, traitId ]
export function cmdRemoveTrait(buf: CommandBuffer, entity: Entity, traitId: TraitId): void {
	ensureCapacity(buf, 3);
	const d = buf.data;
	let w = buf.write;
	d[w++] = OP_REMOVE_TRAIT;
	d[w++] = entity;
	d[w++] = traitId;
	buf.write = w;
}

// MarkTraitChanged [ op, entity, traitId ]
export function cmdMarkTraitChanged(buf: CommandBuffer, entity: Entity, traitId: TraitId): void {
	ensureCapacity(buf, 3);
	const d = buf.data;
	let w = buf.write;
	d[w++] = OP_MARK_TRAIT_CHANGE;
	d[w++] = entity;
	d[w++] = traitId;
	buf.write = w;
}

// ---- Playback -------------------------------------------------------------

export function playbackCommands(buf: CommandBuffer, handlers: CommandHandlers): void {
	const d = buf.data;
	const limit = buf.write;
	const vals = buf.values;
	let i = 0;

	while (i < limit) {
		const op = d[i++];

		switch (op) {
			case OP_SPAWN_ENTITY: {
				const e = d[i++] as Entity;
				handlers.spawnEntity(e);
				break;
			}
			case OP_DESTROY_ENTITY: {
				const e = d[i++] as Entity;
				handlers.destroyEntity(e);
				break;
			}
			case OP_ADD_TRAIT: {
				const e = d[i++] as Entity;
				const t = d[i++] as TraitId;
				handlers.addTrait(e, t);
				break;
			}
			case OP_SET_TRAIT: {
				const e = d[i++] as Entity;
				const t = d[i++] as TraitId;
				const vi = d[i++];
				handlers.setTrait(e, t, vals[vi]);
				break;
			}
			case OP_REMOVE_TRAIT: {
				const e = d[i++] as Entity;
				const t = d[i++] as TraitId;
				handlers.removeTrait(e, t);
				break;
			}
			case OP_MARK_TRAIT_CHANGE: {
				const e = d[i++] as Entity;
				const t = d[i++] as TraitId;
				handlers.markTraitChanged(e, t);
				break;
			}
			default:
				throw new Error(`Unknown opcode: ${op}`);
		}
	}
}


