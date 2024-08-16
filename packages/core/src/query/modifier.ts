import { Component } from '../component/types';
import { World } from '../world/world';
import { $modifier, $modifierID } from './symbols';
import { Modifier } from './types';

type ModifierFn = <W extends World = World>(world: W, ...components: Component[]) => Component[];

export function modifier<T extends ModifierFn>(name: string, id: number, fn: T): Modifier {
	return function _modifier(...components: Component[]) {
		const returnFn = function (world: World) {
			return fn(world, ...components);
		};
		Object.assign(returnFn, { [$modifier]: name, [$modifierID]: id });

		return returnFn;
	} as Modifier;
}

export function isModifier(target: any): target is ReturnType<Modifier> {
	return typeof target === 'function' && target[$modifier];
}
