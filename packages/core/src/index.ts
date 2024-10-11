export { createWorld } from './world/world';
export { trait } from './trait/trait';
export { createAdded } from './query/modifiers/added';
export { createRemoved } from './query/modifiers/removed';
export { createChanged } from './query/modifiers/changed';
export { Not } from './query/modifiers/not';
export { universe } from './universe/universe';
export { cacheQuery } from './query/utils/cache-query';
export { relation, Pair, Wildcard } from './relation/relation';
export { $internal } from './common';

// Export types a global namespace to avoid conflicts with user code.

// prettier-ignore
declare global {
	namespace Koota {
		type World = import('./world/world').World;
		type Schema = import('./trait/types').Schema;
		type Component<TSchema extends Schema = any, TStore = Store<TSchema>> = import('./trait/types').Trait<TSchema, TStore>;
		type Store<T extends Schema = any> = import('./trait/types').Store<T>;
		type SchemaFromComponent<T extends Component> = import('./trait/types').ExtractSchema<T>;
		type ComponentOrWithParams<T extends Component = Component<any, Store<any>>> = import('./trait/types').ConfigurableTrait<T>;
		type QueryParameter = import('./query/types').QueryParameter;
		type Entity = import('./entity/types').Entity;
	}
}
