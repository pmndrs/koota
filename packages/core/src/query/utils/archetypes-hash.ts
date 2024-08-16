import { $componentId } from '../../component/symbols';
import { World } from '../../world/world';
import { isModifier } from '../modifier';
import { $modifierID } from '../symbols';
import { QueryParameter } from '../types';

const sortedIDs = new Float32Array(1024);

export const archetypeHash = (parameters: QueryParameter[]) => {
	sortedIDs.fill(0);
	let cursor = 0;

	for (let i = 0; i < parameters.length; i++) {
		const param = parameters[i];
		if (isModifier(param)) {
			const modifierId = param[$modifierID];
			const components = param();

			for (let i = 0; i < components.length; i++) {
				const componentId = components[i][$componentId];
				sortedIDs[cursor++] = modifierId * 100000 + componentId;
			}
		} else {
			const componentID = param[$componentId];
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
