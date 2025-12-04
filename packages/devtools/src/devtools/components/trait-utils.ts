import { $internal } from '@koota/core';
import type { Trait } from '@koota/core';
import type { SourceInfo, TraitWithDebug } from '../../types';
import { hasDebugName, hasDebugSource, isSourceInfo } from '../utils/type-guards';

export type TraitType = 'tag' | 'soa' | 'aos' | 'rel';

export function getTraitType(trait: Trait): TraitType {
	const ctx = trait[$internal];
	// Check if this trait belongs to a relation
	if (ctx.relation !== null) return 'rel';
	if (ctx.isTag) return 'tag';
	return ctx.type;
}

export function getTraitName(trait: Trait | TraitWithDebug): string {
	const ctx = trait[$internal];

	// For relation traits, show the relation name
	// In the new model, relation traits are the base trait, not pairs
	if (ctx.relation !== null) {
		// Try to get debug name from the relation function itself
		// The relation function may have debugName attached by the unplugin
		const relation = ctx.relation;
		if ('debugName' in relation && typeof (relation as any).debugName === 'string') {
			return (relation as any).debugName;
		}
		return `Relation#${ctx.id}`;
	}

	// Check if trait has debugName (TraitWithDebug)
	if (hasDebugName(trait)) {
		return trait.debugName;
	}

	return `Trait#${ctx.id}`;
}

export function getTraitSource(trait: Trait | TraitWithDebug): SourceInfo | undefined {
	const ctx = trait[$internal];

	// For relation traits, try to get debug source from the relation function
	if (ctx.relation !== null) {
		const relation = ctx.relation;
		if ('debugSource' in relation && isSourceInfo((relation as any).debugSource)) {
			return (relation as any).debugSource;
		}
	}

	if (hasDebugSource(trait)) {
		return trait.debugSource;
	}

	return undefined;
}
