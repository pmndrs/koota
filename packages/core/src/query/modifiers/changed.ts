import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { ensureMaskPage } from '../../entity/utils/paged-mask';
import { isRelation } from '../../relation/utils/is-relation';
import { hasTrait, registerTrait } from '../../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../../trait/trait-instance';
import type { ExtractTraits, Trait, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import type { WorldInternal } from '../../world';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { checkQueryTrackingWithRelations } from '../utils/check-query-tracking-with-relations';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createChanged() {
    const id = createTrackingId();

    for (const world of universe.worlds) {
        if (!world) continue;
        setTrackingMasks(world[$internal], id);
    }

    return <T extends TraitOrRelation[]>(
        ...inputs: T
    ): Modifier<ExtractTraits<T>, `changed-${number}`> => {
        const traits = inputs.map((input) =>
            isRelation(input) ? input[$internal].trait : input
        ) as ExtractTraits<T>;
        return createModifier(`changed-${id}`, id, traits);
    };
}

/** @inline */
function markChanged(ctx: WorldInternal, entity: Entity, trait: Trait) {
    if (!hasTrait(ctx, entity, trait)) return;

    if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
    const data = getTraitInstance(ctx.traitInstances, trait)!;

    const eid = getEntityId(entity);
    const { generationId, bitflag } = data;
    const pageId = eid >>> 10;
    const offset = eid & 1023;

    for (const changedMask of ctx.changedMasks.values()) {
        ensureMaskPage(changedMask[generationId], pageId)[offset] |= bitflag;
    }

    for (const query of data.trackingQueries) {
        if (!query.hasChangedModifiers) continue;
        if (!query.changedTraits.has(trait)) continue;

        const match =
            query.relationFilters && query.relationFilters.length > 0
                ? checkQueryTrackingWithRelations(ctx, query, entity, 'change', generationId, bitflag)
                : query.checkTracking(ctx, entity, 'change', generationId, bitflag);
        if (match) query.add(entity);
        else query.remove(ctx, entity);
    }

    return data;
}

export function setChanged(ctx: WorldInternal, entity: Entity, trait: Trait) {
    const data = markChanged(ctx, entity, trait);
    if (!data) return;
    for (const sub of data.changeSubscriptions) sub(entity);
}

export function setPairChanged(ctx: WorldInternal, entity: Entity, trait: Trait, target: Entity) {
    const data = markChanged(ctx, entity, trait);
    if (!data) return;
    for (const sub of data.changeSubscriptions) sub(entity, target);
}
