import { $internal } from '@koota/core';
import type { Trait } from '@koota/core';
import type { SourceInfo, TraitWithDebug } from '../../types';
import { hasDebugName, hasDebugSource, isSourceInfo } from '../utils/type-guards';

export type TraitType = 'tag' | 'soa' | 'aos' | 'rel';

export function getTraitType(trait: Trait): TraitType {
	const ctx = trait[$internal];
	if (ctx.relation !== null) return 'rel';
	if (ctx.type === 'tag') return 'tag';
	return ctx.type;
}

export function getTraitName(trait: Trait | TraitWithDebug): string {
	const ctx = trait[$internal];

	if (ctx.relation !== null) {
		const relation = ctx.relation;
		if ('debugName' in relation && typeof (relation as any).debugName === 'string') {
			return (relation as any).debugName;
		}
		return `Relation#${ctx.id}`;
	}

	if (hasDebugName(trait)) {
		return trait.debugName ?? `Trait#${ctx.id}`;
	}

	return `Trait#${ctx.id}`;
}

export function getTraitSource(trait: Trait | TraitWithDebug): SourceInfo | undefined {
	const ctx = trait[$internal];

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
