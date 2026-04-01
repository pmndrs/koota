import { $internal } from '../../common';
import { createEntityHandle } from '../../entity/entity-handle';
import type { RawEntity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import { isRelation } from '../../relation/utils/is-relation';
import { hasTrait, registerTrait } from '../../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../../trait/trait-instance';
import type { ExtractTraits, Trait, TraitOrRelation } from '../../trait/types';
import type { World } from '../../world';
import { createModifier } from '../modifier';
import type { Modifier } from '../types';
import { checkQueryTrackingWithRelations } from '../utils/check-query-tracking-with-relations';
import { createTrackingId } from '../utils/tracking-cursor';

export function createChanged() {
    const id = createTrackingId();

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
function markChanged(world: World, entity: RawEntity, trait: Trait) {
    const ctx = world[$internal];

    // Early exit if the trait is not on the entity.
    if (!hasTrait(world, entity, trait)) return;

    // Register the trait if it's not already registered.
    if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(world, trait);
    const data = getTraitInstance(ctx.traitInstances, trait)!;

    // Mark the trait as changed in bitmasks for Changed modifiers.
    const eid = getEntityId(entity);
    const { generationId, bitflag } = data;

    for (const changedMask of ctx.changedMasks.values()) {
        if (!changedMask[generationId]) changedMask[generationId] = [];
        if (!changedMask[generationId][eid]) changedMask[generationId][eid] = 0;
        changedMask[generationId][eid] |= bitflag;
    }

    // Update tracking queries with change event
    for (const query of data.trackingQueries) {
        if (!query.hasChangedModifiers) continue;
        if (!query.changedTraits.has(trait)) continue;

        const match =
            query.relationFilters && query.relationFilters.length > 0
                ? checkQueryTrackingWithRelations(
                      world,
                      query,
                      entity,
                      'change',
                      generationId,
                      bitflag
                  )
                : query.checkTracking(world, entity, 'change', generationId, bitflag);
        if (match) query.add(entity);
        else query.remove(world, entity);
    }

    return data;
}

export function setChanged(world: World, entity: RawEntity, trait: Trait) {
    const data = markChanged(world, entity, trait);
    if (!data) return;
    if (data.changeSubscriptions.size > 0) {
        const source = createEntityHandle(world, entity);
        for (const sub of data.changeSubscriptions) sub(source);
    }
}

export function setPairChanged(world: World, entity: RawEntity, trait: Trait, target: RawEntity) {
    const data = markChanged(world, entity, trait);
    if (!data) return;
    if (data.changeSubscriptions.size > 0) {
        const source = createEntityHandle(world, entity);
        const targetHandle = createEntityHandle(world, target);
        for (const sub of data.changeSubscriptions) sub(source, targetHandle);
    }
}
