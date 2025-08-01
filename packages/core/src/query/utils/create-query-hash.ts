import { $internal } from '../../';
import { isModifier } from '../modifier';
import type { QueryParameter } from '../types';

const sortedIDs = new Float32Array(1024);

export const createQueryHash = (parameters: QueryParameter[]) => {
	sortedIDs.fill(0);
	let cursor = 0;

	for (let i = 0; i < parameters.length; i++) {
		const param = parameters[i];
		if (isModifier(param)) {
			const modifierId = param.id;
			const traitIds = param.traitIds;

			for (let i = 0; i < traitIds.length; i++) {
				const traitId = traitIds[i];
				sortedIDs[cursor++] = modifierId * 100000 + traitId;
			}
		} else {
			const traitId = param[$internal].id;
			sortedIDs[cursor++] = traitId;
		}
	}

	// Sort only the portion of the array that has been filled.
	const filledArray = sortedIDs.subarray(0, cursor);
	filledArray.sort();

	// Create string key.
	const hash = filledArray.join(',');

	return hash;
};
