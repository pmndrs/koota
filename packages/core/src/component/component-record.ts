import { Entity } from '../entity/types';
import { Query } from '../query/query';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { Component, Schema, SchemaFromComponent, Store } from './types';

export class ComponentRecord<
	C extends Component = Component,
	S extends Schema = SchemaFromComponent<C>
> {
	generationId: number;
	bitflag: number;
	component: Component;
	store: Store<S>;
	queries: Set<Query>;
	notQueries: Set<Query>;
	schema: S;
	changedSubscriptions: Set<(entity: Entity) => void>;

	constructor(world: World, component: C) {
		const ctx = world[$internal];
		const componentCtx = component[$internal];

		this.generationId = ctx.entityMasks.length - 1;
		this.bitflag = ctx.bitflag;
		this.component = component;
		this.store = componentCtx.createStore();
		this.queries = new Set();
		this.notQueries = new Set();
		this.schema = component.schema;
		this.changedSubscriptions = new Set();

		componentCtx.stores[world.id] = this.store;
	}
}
