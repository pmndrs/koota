import { $createInstance } from '../../component/symbols';
import { Component, ComponentInstance, SchemaFromComponent } from '../../component/types';

export class Resources {
	#resources = new Map<Component, ComponentInstance>();

	add(...components: Component[]) {
		for (const component of components) {
			this.#resources.set(component, component[$createInstance]());
		}
	}

	remove(component: Component) {
		this.#resources.delete(component);
	}

	get<C extends Component>(component: C): ComponentInstance<SchemaFromComponent<C>> {
		return this.#resources.get(component)! as ComponentInstance<SchemaFromComponent<C>>;
	}

	has<C extends Component>(component: C): boolean {
		return this.#resources.has(component);
	}

	clear() {
		this.#resources.clear();
	}
}
