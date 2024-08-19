import { $componentId } from '../../component/symbols';
import { isModifier } from '../modifier';
import { $modifierComponentIds, $modifierID } from '../symbols';
import { QueryParameter } from '../types';

const sortedIDs = new Float32Array(1024);

export const createQueryHash = (parameters: QueryParameter[]) => {
	sortedIDs.fill(0);
	let cursor = 0;

	for (let i = 0; i < parameters.length; i++) {
		const param = parameters[i];
		if (isModifier(param)) {
			const modifierId = param[$modifierID];
			const componentIds = param[$modifierComponentIds];

			for (let i = 0; i < componentIds.length; i++) {
				const componentId = componentIds[i];
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
