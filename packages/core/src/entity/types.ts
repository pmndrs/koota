import { Component, ComponentOrWithParams } from '../component/types';

export type Entity = number & {
	add: (...components: ComponentOrWithParams[]) => void;
	remove: (...components: Component[]) => void;
	has: (component: Component) => boolean;
	destroy: () => void;
	changed: (component: Component) => void;
};
