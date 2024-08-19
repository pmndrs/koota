export { createWorld } from './world/world';
export { define } from './component/component';
export { createAdded } from './query/modifiers/added';
export { createRemoved } from './query/modifiers/removed';
export { createChanged } from './query/modifiers/changed';
export { universe } from './universe/universe';
export { cacheQuery } from './query/utils/cache-query';

import * as worldSymbols from './world/symbols';
import * as componentSymbols from './component/symbols';
import * as querySymbols from './query/symbols';
import * as relationSymbols from './relation/symbols';

export const SYMBOLS = {
	...worldSymbols,
	...componentSymbols,
	...querySymbols,
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
		type ComponentInstance<T extends Schema = any> = import('./component/types').ComponentInstance<T>;
		type SchemaFromComponent<T extends Component> = import('./component/types').SchemaFromComponent<T>;
		type ComponentOrWithParams<T extends Component = Component<any, Store<any>>> = import('./component/types').ComponentOrWithParams<T>;
		type QueryParameter = import('./query/types').QueryParameter;
	}
}
