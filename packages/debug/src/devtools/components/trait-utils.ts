import { $internal } from '@koota/core';
import type { Trait } from '@koota/core';
import type { TraitWithDebug } from '../../types';

export type TraitType = 'tag' | 'soa' | 'aos' | 'rel';

export function getTraitType(trait: Trait): TraitType {
	const ctx = trait[$internal];
	if (ctx.isPairTrait) return 'rel';
	if (ctx.isTag) return 'tag';
	return ctx.type;
}

export function getTraitName(trait: TraitWithDebug): string {
	const ctx = trait[$internal];

	// For pair traits (relations), try to get the relation's debug name
	if (ctx.isPairTrait && ctx.relation) {
		const relationDebugName = (ctx.relation as TraitWithDebug).debugName;
		const targetName = getTargetName(ctx.pairTarget);
		if (relationDebugName) {
			return `${relationDebugName}(${targetName})`;
		}
		return `Relation(${targetName})`;
	}

	return trait.debugName ?? `Trait#${ctx.id}`;
}

function getTargetName(target: unknown): string {
	if (target === null || target === undefined) return '?';
	if (typeof target === 'number') return String(target);
	if (typeof target === 'string') return target;
	// Wildcard or other special targets
	return '*';
}
