import type { Trait } from '../types';
import type { TraitData } from '../types';
import { $internal } from '../../common';

export type TraitDataArray = (TraitData | undefined)[];

/**
 * Get TraitData by trait ID
 */
export /* @inline @pure */ function getTraitData(
	traitData: TraitDataArray,
	trait: Trait
): TraitData | undefined {
	return traitData[trait[$internal].id];
}

/**
 * Set TraitData by trait ID
 */
export /* @inline */ function setTraitData(
	traitData: TraitDataArray,
	trait: Trait,
	data: TraitData
): void {
	const traitId = trait[$internal].id;
	// Ensure array is large enough
	if (traitId >= traitData.length) {
		traitData.length = traitId + 1;
	}
	traitData[traitId] = data;
}

/**
 * Check if trait is registered
 */
export /* @inline @pure */ function hasTraitData(traitData: TraitDataArray, trait: Trait): boolean {
	const traitId = trait[$internal].id;
	return traitId < traitData.length && traitData[traitId] !== undefined;
}

/**
 * Clear all trait data
 */
export /* @inline */ function clearTraitData(traitData: TraitDataArray): void {
	traitData.length = 0;
}
