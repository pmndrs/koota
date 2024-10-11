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
	changedSubscriptions: Set<(entity: Entity) => void>;

	constructor(world: World, trait: T) {
		const ctx = world[$internal];
		const traitCtx = trait[$internal];

		this.generationId = ctx.entityMasks.length - 1;
		this.bitflag = ctx.bitflag;
		this.trait = trait;
		this.store = traitCtx.createStore();
		this.queries = new Set();
		this.notQueries = new Set();
		this.schema = trait.schema;
		this.changedSubscriptions = new Set();

		traitCtx.stores[world.id] = this.store;
	}
}
