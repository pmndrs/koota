import type { Trait } from '../types';
import type { TraitData } from '../types';
import { $internal } from '../../common';

export type TraitDataArray = (TraitData | undefined)[];

/**
 * Get TraitData by trait ID (O(1) array access).
 */
/* @inline @pure */ export function getTraitData(
	traitData: TraitDataArray,
	trait: Trait
): TraitData | undefined {
	const traitId = trait[$internal].id;
	return traitData[traitId];
}

/**
 * Set TraitData by trait ID, ensuring array is large enough.
 */
/* @inline @pure */ export function setTraitData(
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
 * Check if trait is registered (has TraitData).
 */
/* @inline @pure */ export function hasTraitData(traitData: TraitDataArray, trait: Trait): boolean {
	const traitId = trait[$internal].id;
	return traitId < traitData.length && traitData[traitId] !== undefined;
}

/**
 * Clear all trait data (reset array length to 0).
 */
export function clearTraitData(traitData: TraitDataArray): void {
	traitData.length = 0;
}
