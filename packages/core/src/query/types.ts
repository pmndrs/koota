import { Component } from '../component/types';
import { Entity } from '../entity/types';
import { World } from '../world/world';
import { $modifier, $modifierComponentIds, $modifierID } from './symbols';

export type ModifierFn = ((...components: Component[]) => Component[]) & {
	[$modifier]: string;
	[$modifierID]: number;
	[$modifierComponentIds]: number[];
};

export type Modifier = (...components: Component[]) => ModifierFn;

export type QueryParameter = Component | ReturnType<Modifier>;

export type QuerySubscriber = (entity: Entity) => void;

export type QueryResult = readonly Entity[] & {
	updateEach: (
		callback: (state: Record<string, any>[], entity: Entity, index: number) => void
	) => void;
};
