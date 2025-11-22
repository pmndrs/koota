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
