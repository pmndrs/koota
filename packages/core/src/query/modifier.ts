import { $internal } from '../common';
import { Trait } from '../trait/types';
import { ModifierData, QueryParameter } from './types';

export const $modifier = Symbol('modifier');

export function createModifier<TTrait extends Trait[] = Trait[], TType extends string = string>(
	type: TType,
	id: number,
	traits: TTrait
): ModifierData<TTrait, TType> {
	return {
		[$modifier]: true,
		type,
		id,
		traits,
		traitIds: traits.map((trait) => trait[$internal].id),
	} as const;
}

export function isModifier(param: QueryParameter): param is ModifierData {
	return $modifier in param;
}
