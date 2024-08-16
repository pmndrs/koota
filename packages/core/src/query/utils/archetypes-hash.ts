import { registerComponent } from '../../component/component';
import { Component } from '../../component/types';
import { $componentRecords } from '../../world/symbols';
import { World } from '../../world/world';
import { isModifier } from '../modifier';
import { $modifierID } from '../symbols';
import { QueryParameter } from '../types';

const sortedIDs = new Float32Array(1024);

export const archetypeHash = (world: World, parameters: QueryParameter[]) => {
	sortedIDs.fill(0);
	let cursor = 0;

	for (let i = 0; i < parameters.length; i++) {
		const param = parameters[i];
		if (isModifier(param)) {
			const modifierID = param[$modifierID];
			const components = param(world);

			for (let i = 0; i < components.length; i++) {
				const componentID = getComponentID(world, components[i]);
				sortedIDs[cursor++] = modifierID * 100000 + componentID;
			}
		} else {
			const componentID = getComponentID(world, param);
			sortedIDs[cursor++] = componentID;
		}
	}

	// Sort only the portion of the array that has been filled.
	const filledArray = sortedIDs.subarray(0, cursor);
	filledArray.sort();

	// Create string key.
	const hash = filledArray.join(',');

	return hash;
};

function getComponentID(world: World, component: Component) {
	if (!world[$componentRecords].has(component)) registerComponent(world, component);
	const record = world[$componentRecords].get(component)!;
	return record.id;
}
