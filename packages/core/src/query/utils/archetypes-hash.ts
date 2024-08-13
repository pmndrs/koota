import { registerComponent } from '../../component/component';
import { Component } from '../../component/types';
import { $componentRecords } from '../../world/symbols';
import { World } from '../../world/world';
import { isModifier } from '../modifier';
import { $modifier } from '../symbols';
import { QueryParameter } from '../types';

export const archetypeHash = (world: World, parameters: QueryParameter[]) => {
	// Group parameters by modifier
	const groupedParams = new Map<string | undefined, Component[]>();

	parameters.forEach((param: QueryParameter) => {
		let modifier: string | undefined;
		let components: Component[];

		if (isModifier(param)) {
			modifier = param[$modifier];
			components = param(world);
		} else {
			components = [param as Component];
		}

		if (!groupedParams.has(modifier)) {
			groupedParams.set(modifier, []);
		}
		groupedParams.get(modifier)!.push(...components);
	});

	// Sort components within each group
	groupedParams.forEach((components, modifier) => {
		components.sort((a: Component, b: Component) => {
			if (!world[$componentRecords].has(a)) registerComponent(world, a);
			if (!world[$componentRecords].has(b)) registerComponent(world, b);
			const aInstance = world[$componentRecords].get(a)!;
			const bInstance = world[$componentRecords].get(b)!;
			return aInstance.id > bInstance.id ? 1 : -1;
		});
	});

	// Generate hash
	const sortedModifiers = Array.from(groupedParams.keys()).sort();
	const hash = sortedModifiers.reduce((acc: string, modifier: string | undefined) => {
		const components = groupedParams.get(modifier)!;
		const componentIds = components
			.map((comp) => {
				if (!world[$componentRecords].has(comp)) {
					registerComponent(world, comp);
				}
				return world[$componentRecords].get(comp)!.id;
			})
			.join(',');

		if (modifier) {
			return `${acc}-${modifier}(${componentIds})`;
		} else {
			return `${acc}-${componentIds}`;
		}
	}, '');

	return hash;
};
