export { createWorld } from './world/world';
export { define } from './component/component';
export { createAdded } from './query/modifiers/added';
export { createRemoved } from './query/modifiers/removed';
export { createChanged } from './query/modifiers/changed';
export { Not } from './query/modifiers/not';
export { universe } from './universe/universe';
export { cacheQuery } from './query/utils/cache-query';
export { relation, Pair, Wildcard } from './relation/relation';

import * as worldSymbols from './world/symbols';
import * as relationSymbols from './relation/symbols';

export const SYMBOLS = {
	...worldSymbols,
	...relationSymbols,
};

// Export types a global namespace to avoid conflicts with user code.

// prettier-ignore
declare global {
	namespace Koota {
		type World = import('./world/world').World;
		type Schema = import('./component/types').Schema;
		type Component<TSchema extends Schema = any, TStore = Store<TSchema>> = import('./component/types').Component<TSchema, TStore>;
		type Store<T extends Schema = any> = import('./component/types').Store<T>;
		type SchemaFromComponent<T extends Component> = import('./component/types').SchemaFromComponent<T>;
		type ComponentOrWithParams<T extends Component = Component<any, Store<any>>> = import('./component/types').ComponentOrWithParams<T>;
		type QueryParameter = import('./query/types').QueryParameter;
		type Entity = import('./entity/types').Entity;
	}
}
