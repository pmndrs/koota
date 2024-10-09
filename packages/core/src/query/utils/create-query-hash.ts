import { $internal } from '../../world/symbols';
import { ModifierData } from '../modifier';
import { QueryParameter } from '../types';

const sortedIDs = new Float32Array(1024);

export const createQueryHash = (parameters: QueryParameter[]) => {
	sortedIDs.fill(0);
	let cursor = 0;

	for (let i = 0; i < parameters.length; i++) {
		const param = parameters[i];
		if (param instanceof ModifierData) {
			const modifierId = param.id;
			const componentIds = param.componentIds;

			for (let i = 0; i < componentIds.length; i++) {
				const componentId = componentIds[i];
				sortedIDs[cursor++] = modifierId * 100000 + componentId;
			}
		} else {
			const componentID = param[$internal].id;
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
