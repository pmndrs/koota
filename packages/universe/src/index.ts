import { Entity, Trait } from '@koota/core';
import { createAdd, createGet, createRemove } from '../../core/src/entity/entity-methods-pure';
import { Universe } from '../../core/src/universe/universe';

export { createUniverse } from '../../core/src/universe/universe';
export { createWorldFromUniverse } from '../../core/src/world/world';
export type { Universe } from '../../core/src/universe/universe';

export function createEntityOperations(universe: Universe) {
	const add = createAdd(universe);
	const remove = createRemove(universe);
	const getFn = createGet(universe);
	return {
		add: (e: Entity, ...traits: Trait[]) => add.call(e, ...traits),
		remove: (e: Entity, ...traits: Trait[]) => remove.call(e, ...traits),
		get: (e: Entity, trait: Trait) => getFn.call(e, trait),
	};
}
