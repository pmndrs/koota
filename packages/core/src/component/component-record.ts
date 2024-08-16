import { Query } from '../query/query';
import { $bitflag, $entityMasks } from '../world/symbols';
import { World } from '../world/world';
import { $createStore } from './symbols';
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
	changedSubscriptions: Set<(entity: number) => void>;

	constructor(world: World, component: C) {
		this.generationId = world[$entityMasks].length - 1;
		this.bitflag = world[$bitflag];
		this.component = component;
		this.store = component[$createStore]();
		this.queries = new Set();
		this.notQueries = new Set();
		this.schema = component.schema;
		this.changedSubscriptions = new Set();
	}
}
