import { Component } from '../component/types';
import { $modifier, $modifierID } from './symbols';
import { Modifier } from './types';

type Fn = (...components: Component[]) => Component[];

export function modifier<T extends Fn>(name: string, id: number, fn: T): Modifier {
	return function _modifier(...components: Component[]) {
		const returnFn = function () {
			return fn(...components);
		};
		Object.assign(returnFn, { [$modifier]: name, [$modifierID]: id });

		return returnFn;
	} as Modifier;
}

export function isModifier(target: any): target is ReturnType<Modifier> {
	return typeof target === 'function' && target[$modifier];
}
