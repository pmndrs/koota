import { Entity } from '../entity/types';
import { Query } from '../query/query';
import { $internal } from '../common';
import { World } from '../world/world';
import { Trait, Schema, ExtractSchema, Store } from './types';

export class TraitData<T extends Trait = Trait, S extends Schema = ExtractSchema<T>> {
	generationId: number;
	bitflag: number;
	trait: Trait;
	store: Store<S>;
	queries: Set<Query>;
	notQueries: Set<Query>;
	schema: S;
	changeSubscriptions: Set<(entity: Entity) => void>;
	addSubscriptions: Set<(entity: Entity) => void>;
	removeSubscriptions: Set<(entity: Entity) => void>;

	constructor(world: World, trait: T) {
		const ctx = world[$internal];
		const traitCtx = trait[$internal];

		this.generationId = ctx.entityMasks.length - 1;
		this.bitflag = ctx.bitflag;
		this.trait = trait;
		this.store = traitCtx.createStore() as Store<S>;
		this.queries = new Set();
		this.notQueries = new Set();
		this.schema = trait.schema;
		this.changeSubscriptions = new Set();
		this.addSubscriptions = new Set();
		this.removeSubscriptions = new Set();

		traitCtx.stores[world.id] = this.store;
	}
}
