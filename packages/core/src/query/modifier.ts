import { Brand } from '../common';
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
		traitIds: traits.map((trait) => trait.id),
	} as const;
}

export /* @inline @pure */ function isModifier(param: QueryParameter): param is ModifierData {
	return (param as Brand<typeof $modifier> | null | undefined)?.[$modifier] as unknown as boolean;
}
