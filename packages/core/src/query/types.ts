import { Component } from '../component/types';
import { World } from '../world/world';
import { $modifier } from './symbols';

export type ModifierFn<W extends World = World> = ((
	world: W,
	...components: Component[]
) => Component[]) & {
	[$modifier]: string;
};

export type Modifier<W extends World = World> = (...components: Component[]) => ModifierFn<W>;

export type QueryParameter = Component | ReturnType<Modifier>;

export type QuerySubscriber = (type: 'add' | 'remove', entity: number) => void;
