import type { Entity } from '../entity/types';
import type { World } from './world';
import {
	CommandBuffer,
	OP_ADD_TRAIT,
	OP_DESTROY_ENTITY,
	OP_MARK_TRAIT_CHANGE,
	OP_REMOVE_TRAIT,
	OP_SET_TRAIT,
	OP_SPAWN_ENTITY,
	TraitId,
} from './command-buffer';
import {
	executeAddTraitMembership,
	executeFireAddSubscriptions,
	executeMarkTraitChanged,
	executeRemoveTrait,
	executeSetTrait,
} from '../trait/trait-commands';
import { executeDestroyEntity, executeSpawnEntity } from '../entity/entity-commands';

function makeKey(entity: Entity, traitId: TraitId): string {
	return `${entity}:${traitId}`;
}

export function createInterpreter(world: World) {
	return (buf: CommandBuffer): void => {
		const d = buf.data;
		const vals = buf.values;
		const limit = buf.write;
		let i = 0;

		// Track traits that were newly added in this flush so we can
		// fire addSubscriptions *after* their data has been set.
		const newlyAdded = new Set<string>();

		while (i < limit) {
			const op = d[i++];

			switch (op) {
				case OP_SPAWN_ENTITY: {
					const e = d[i++] as Entity;
					executeSpawnEntity(world, e);
					break;
				}
				case OP_DESTROY_ENTITY: {
					const e = d[i++] as Entity;
					executeDestroyEntity(world, e);
					break;
				}
				case OP_ADD_TRAIT: {
					const e = d[i++] as Entity;
					const t = d[i++] as TraitId;
					executeAddTraitMembership(world, e, t);
					newlyAdded.add(makeKey(e, t));
					break;
				}
				case OP_SET_TRAIT: {
					const e = d[i++] as Entity;
					const t = d[i++] as TraitId;
					const vi = d[i++];
					executeSetTrait(world, e, t, vals[vi]);

					const key = makeKey(e, t);
					if (newlyAdded.has(key)) {
						executeFireAddSubscriptions(world, e, t);
						newlyAdded.delete(key);
					}
					break;
				}
				case OP_REMOVE_TRAIT: {
					const e = d[i++] as Entity;
					const t = d[i++] as TraitId;
					executeRemoveTrait(world, e, t);
					// In case an add+remove happened in the same flush, avoid firing add callbacks.
					newlyAdded.delete(makeKey(e, t));
					break;
				}
				case OP_MARK_TRAIT_CHANGE: {
					const e = d[i++] as Entity;
					const t = d[i++] as TraitId;
					executeMarkTraitChanged(world, e, t);
					break;
				}
				default:
					throw new Error(`Unknown opcode: ${op}`);
			}
		}
	};
}
