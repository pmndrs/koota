import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { getRelationTargets, Pair, Wildcard } from '../relation/relation';
import type { Command } from '../utils/command-buffer';
import type { World } from '../world/world';
import { addTrait, hasTrait, registerTrait, removeTrait, setTrait } from './trait';
import type { Trait } from './types';

const COMMAND_TYPES = {
	ADD: 'add',
	REMOVE: 'remove',
} as const;

type CommandType = (typeof COMMAND_TYPES)[keyof typeof COMMAND_TYPES];

type CommandArgs = {
	add: {
		world: World;
		entity: Entity;
		trait: Trait;
		params?: Record<string, any>;
	};
	remove: {
		world: World;
		entity: Entity;
		trait: Trait;
	};
};

export interface GenericCommand<T extends CommandType = CommandType> extends Command {
	type: T;
	args: CommandArgs[T];
}

// Overloaded function signatures for type safety
export function command(type: 'add', args: CommandArgs['add']): GenericCommand<'add'>;
export function command(type: 'remove', args: CommandArgs['remove']): GenericCommand<'remove'>;
export function command<T extends CommandType>(type: T, args: CommandArgs[T]): GenericCommand<T> {
	return {
		type,
		args,
		execute() {
			switch (type) {
				case 'add':
					const { world, entity, trait, params } = args as CommandArgs['add'];
					commitAddTrait(world, entity, trait, params);
					break;
				case 'remove':
					throw new Error('Remove command not yet implemented');
				default:
					throw new Error(`Unknown command type: ${type}`);
			}
		},
	};
}

/**
 * Commits a single trait addition. This contains the core logic
 * that was previously in addTrait.
 */
function commitAddTrait(world: World, entity: Entity, trait: Trait, params?: Record<string, any>) {
	const ctx = world[$internal];

	// Exit early if the entity already has the trait.
	if (hasTrait(world, entity, trait)) return;

	const traitCtx = trait[$internal];

	// Register the trait if it's not already registered.
	if (!ctx.traitData.has(trait)) registerTrait(world, trait);

	const data = ctx.traitData.get(trait)!;
	const { generationId, bitflag } = data;

	// Add bitflag to entity bitmask.
	const eid = getEntityId(entity);
	ctx.entityMasks[generationId][eid] |= bitflag;

	// Set the entity as dirty.
	for (const dirtyMask of ctx.dirtyMasks.values()) {
		if (!dirtyMask[generationId]) dirtyMask[generationId] = [];
		dirtyMask[generationId][eid] |= bitflag;
	}

	// Emit store update event instead of directly updating queries
	ctx.storeEventEmitter.emit({
		type: 'add',
		entity,
		trait,
		traitData: data,
	});

	// Add trait to entity internally.
	ctx.entityTraits.get(entity)!.add(trait);

	const relation = traitCtx.relation;
	const target = traitCtx.pairTarget;

	// Add relation target entity.
	if (traitCtx.isPairTrait && relation !== null && target !== null) {
		// Mark entity as a relation target.
		ctx.relationTargetEntities.add(target);

		// Add wildcard relation traits.
		addTrait(world, entity, Pair(Wildcard, target));
		addTrait(world, entity, Pair(relation, Wildcard));

		// If it's an exclusive relation, remove the old target.
		if (relation[$internal].exclusive === true && target !== Wildcard) {
			const oldTarget = getRelationTargets(world, relation, entity)[0];

			if (oldTarget !== null && oldTarget !== undefined && oldTarget !== target) {
				removeTrait(world, entity, relation(oldTarget));
			}
		}
	}

	if (traitCtx.type === 'soa') {
		// Set default values or override with provided params.
		const defaults: Record<string, any> = {};
		// Execute any functions in the schema for default values.
		for (const key in data.schema) {
			if (typeof data.schema[key] === 'function') {
				defaults[key] = data.schema[key]();
			} else {
				defaults[key] = data.schema[key];
			}
		}

		setTrait(world, entity, trait, { ...defaults, ...params }, false);
	} else {
		const state = params ?? data.schema();
		setTrait(world, entity, trait, state, false);
	}

	// Call add subscriptions.
	for (const sub of data.addSubscriptions) {
		sub(entity);
	}
}
