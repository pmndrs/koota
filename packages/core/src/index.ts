export { World } from './world/world';
export { define } from './component/component';
export { createAdded } from './query/modifiers/added';
export { createRemoved } from './query/modifiers/removed';
export { createChanged } from './query/modifiers/changed';
export { universe } from './universe/universe';
import { World as WorldCore } from './world/world';

export {
	type Component,
	type ComponentOrWithParams,
	type Store,
	type ComponentInstance,
	type Schema,
	type SchemaFromComponent,
} from './component/types';

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

namespace Sweet {
	export type World = WorldCore;
}
