import {
	Component,
	ComponentOrWithParams,
	PropsFromSchema,
	SchemaFromComponent,
} from '../component/types';
import { Relation } from '../relation/types';

export type Entity = number & {
	add: (...components: ComponentOrWithParams[]) => void;
	remove: (...components: Component[]) => void;
	has: (component: Component) => boolean;
	destroy: () => void;
	changed: (component: Component) => void;
	set: <C extends Component>(
		component: C,
		value: Partial<PropsFromSchema<SchemaFromComponent<C>>>
	) => void;
	get: <C extends Component>(component: C) => PropsFromSchema<SchemaFromComponent<C>>;
	targetFor: <T>(relation: Relation<T>) => Entity | undefined;
	targetsFor: <T>(relation: Relation<T>) => Entity[];
};
