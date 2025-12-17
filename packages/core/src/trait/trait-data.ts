import type { Trait } from './types';
import type { TraitInstance } from './types';
import { $internal } from '../common';

export type TraitInstanceArray = (TraitInstance | undefined)[];

/**
 * Get TraitInstance by trait ID
 */
export /* @inline @pure */ function getTraitData(
	traitData: TraitInstanceArray,
	trait: Trait
): TraitInstance | undefined {
	return traitData[trait.id];
}

/**
 * Set TraitInstance by trait ID
 */
export /* @inline */ function setTraitData(
	traitData: TraitInstanceArray,
	trait: Trait,
	data: TraitInstance
): void {
	const traitId = trait.id;
	// Ensure array is large enough
	if (traitId >= traitData.length) {
		traitData.length = traitId + 1;
	}
	traitData[traitId] = data;
}

/**
 * Check if trait is registered
 */
export /* @inline @pure */ function hasTraitData(
	traitData: TraitInstanceArray,
	trait: Trait
): boolean {
	const traitId = trait.id;
	return traitId < traitData.length && traitData[traitId] !== undefined;
}

/**
 * Clear all trait data
 */
export /* @inline */ function clearTraitData(traitData: TraitInstanceArray): void {
	traitData.length = 0;
}
