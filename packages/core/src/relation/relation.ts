import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { Schema } from '../storage';
import { hasTrait, trait } from '../trait/trait';
import { getTraitInstance } from '../trait/trait-instance';
import type { Trait } from '../trait/types';
import type { WorldInternal } from '../world';
import type { Relation, RelationPair, RelationTarget } from './types';
import { $relation, $relationPair } from './symbols';

function ensureRelPage(arr: any[], pageId: number): any[] {
    if (!arr[pageId]) arr[pageId] = [];
    return arr[pageId];
}

function createRelation<S extends Schema = Record<string, never>>(definition?: {
    exclusive?: boolean;
    autoDestroy?: 'orphan' | 'source' | 'target';
    /** @deprecated Use `autoDestroy: 'orphan'` instead */
    autoRemoveTarget?: boolean;
    store?: S;
}): Relation<Trait<S>> {
    const relationTrait = trait(definition?.store ?? ({} as S)) as unknown as Trait<S>;
    const traitCtx = relationTrait[$internal];

    traitCtx.relation = null!;

    let autoDestroy: 'source' | 'target' | false = false;
    if (definition?.autoDestroy === 'orphan' || definition?.autoDestroy === 'source') {
        autoDestroy = 'source';
    } else if (definition?.autoDestroy === 'target') {
        autoDestroy = 'target';
    }

    if (definition?.autoRemoveTarget) {
        console.warn(
            "Koota: 'autoRemoveTarget' is deprecated. Use 'autoDestroy: \"orphan\"' instead."
        );
        autoDestroy = 'source';
    }

    const relationCtx = {
        trait: relationTrait,
        exclusive: definition?.exclusive ?? false,
        autoDestroy,
    };

    function relationFn(
        target: RelationTarget,
        params?: Record<string, unknown>
    ): RelationPair<Trait<S>> {
        if (target === undefined) throw Error('Relation target is undefined');

        return {
            [$relationPair]: true,
            [$internal]: {
                relation: relationFn as Relation<Trait<S>>,
                target,
                params,
            },
        } as RelationPair<Trait<S>>;
    }

    const relation = Object.assign(relationFn, {
        [$internal]: relationCtx,
    }) as Relation<Trait<S>>;

    Object.defineProperty(relation, $relation, {
        value: true,
        writable: false,
        enumerable: false,
        configurable: false,
    });

    traitCtx.relation = relation;

    return relation;
}

export const relation = createRelation;

export /* @inline */ function getRelationTargets(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity
): readonly Entity[] {
    const relationCtx = relation[$internal];

    const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
    if (!traitData || !traitData.relationTargets) return [];

    const eid = getEntityId(entity);
    const p = eid >>> 10,
        o = eid & 1023;
    const page = traitData.relationTargets[p];
    if (!page) return [];

    if (relationCtx.exclusive) {
        const target = page[o] as Entity | undefined;
        return target !== undefined ? [target] : [];
    } else {
        const targets = page[o] as number[] | undefined;
        return targets !== undefined ? (targets.slice() as Entity[]) : [];
    }
}

export /* @inline */ function getFirstRelationTarget(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity
): Entity | undefined {
    const relationCtx = relation[$internal];

    const traitData = getTraitInstance(ctx.traitInstances, relationCtx.trait);
    if (!traitData || !traitData.relationTargets) return undefined;

    const eid = getEntityId(entity);
    const page = traitData.relationTargets[eid >>> 10];
    if (!page) return undefined;

    if (relationCtx.exclusive) {
        return page[eid & 1023] as Entity | undefined;
    } else {
        return (page[eid & 1023] as number[] | undefined)?.[0] as Entity | undefined;
    }
}

export /* @inline */ function getTargetIndex(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity,
    target: Entity
): number {
    const relationCtx = relation[$internal];
    const baseTrait = relationCtx.trait;

    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData || !traitData.relationTargets) return -1;

    const eid = getEntityId(entity);
    const page = traitData.relationTargets[eid >>> 10];
    if (!page) return -1;

    if (relationCtx.exclusive) {
        return page[eid & 1023] === target ? 0 : -1;
    } else {
        const targets = page[eid & 1023] as number[] | undefined;
        return targets ? targets.indexOf(target) : -1;
    }
}

export /* @inline */ function hasRelationToTarget(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity,
    target: Entity
): boolean {
    const relationCtx = relation[$internal];
    const baseTrait = relationCtx.trait;

    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData || !traitData.relationTargets) return false;

    const eid = getEntityId(entity);
    const page = traitData.relationTargets[eid >>> 10];
    if (!page) return false;

    if (relationCtx.exclusive) {
        return page[eid & 1023] === target;
    } else {
        const targets = page[eid & 1023] as number[] | undefined;
        return targets ? targets.includes(target) : false;
    }
}

export function addRelationTarget(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity,
    target: Entity
): number {
    const relationCtx = relation[$internal];
    const baseTrait = relationCtx.trait;

    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData) return -1;

    if (!traitData.relationTargets) {
        traitData.relationTargets = [];
    }

    const eid = getEntityId(entity);
    const p = eid >>> 10,
        o = eid & 1023;
    const page = ensureRelPage(traitData.relationTargets, p);

    let targetIndex: number;

    if (relationCtx.exclusive) {
        if (page[o] === target) return -1;
        page[o] = target;
        targetIndex = 0;
    } else {
        if (!page[o]) page[o] = [];
        const entityTargets = page[o] as number[];

        const existingIndex = entityTargets.indexOf(target);
        if (existingIndex !== -1) return -1;

        targetIndex = entityTargets.length;
        entityTargets.push(target);
    }

    // Maintain reverse index: target -> source entities.
    if (!traitData.relationSources) traitData.relationSources = [];
    const tid = getEntityId(target);
    const sources = traitData.relationSources[tid];
    if (sources) {
        sources.push(entity);
    } else {
        traitData.relationSources[tid] = [entity];
    }

    updateQueriesForRelationChange(ctx, relation, entity);

    return targetIndex;
}

export function removeRelationTarget(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity,
    target: Entity
): { removedIndex: number; wasLastTarget: boolean } {
    const relationCtx = relation[$internal];
    const relationTrait = relationCtx.trait;

    const data = getTraitInstance(ctx.traitInstances, relationTrait);
    if (!data || !data.relationTargets) return { removedIndex: -1, wasLastTarget: false };

    const eid = getEntityId(entity);
    const p = eid >>> 10,
        o = eid & 1023;
    const page = data.relationTargets[p];
    if (!page) return { removedIndex: -1, wasLastTarget: false };

    let removedIndex = -1;
    let hasRemainingTargets = false;

    if (relationCtx.exclusive) {
        if (page[o] === target) {
            page[o] = undefined;
            removedIndex = 0;
            hasRemainingTargets = false;
            clearRelationDataInternal(data.store, relationTrait[$internal].type, eid, 0, true);
        }
    } else {
        const entityTargets = page[o] as number[] | undefined;
        if (entityTargets) {
            const idx = entityTargets.indexOf(target);
            if (idx !== -1) {
                const lastIdx = entityTargets.length - 1;
                if (idx !== lastIdx) {
                    entityTargets[idx] = entityTargets[lastIdx];
                }
                entityTargets.pop();
                swapAndPopRelationData(data.store, relationTrait[$internal].type, eid, idx, lastIdx);
                removedIndex = idx;
                hasRemainingTargets = entityTargets.length > 0;
            }
        }
    }

    if (removedIndex !== -1) {
        // Clean up reverse index.
        if (data.relationSources) {
            const tid = getEntityId(target);
            const sources = data.relationSources[tid];
            if (sources) {
                const si = sources.indexOf(entity);
                if (si !== -1) {
                    const last = sources.length - 1;
                    if (si !== last) sources[si] = sources[last];
                    sources.pop();
                }
            }
        }

        updateQueriesForRelationChange(ctx, relation, entity);
    }

    const wasLastTarget = removedIndex !== -1 && !hasRemainingTargets;
    return { removedIndex, wasLastTarget };
}

function updateQueriesForRelationChange(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity
): void {
    const baseTrait = relation[$internal].trait;
    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData) return;

    for (const query of traitData.relationQueries) {
        const match = checkQueryWithRelations(ctx, query, entity);
        if (match) {
            query.add(entity);
        } else {
            query.remove(ctx, entity);
        }
    }
}

function swapAndPopRelationData(
    store: any,
    type: string,
    eid: number,
    idx: number,
    lastIdx: number
): void {
    const p = eid >>> 10,
        o = eid & 1023;
    if (type === 'aos') {
        const arr = store[p]?.[o];
        if (arr) {
            if (idx !== lastIdx) arr[idx] = arr[lastIdx];
            arr.pop();
        }
    } else {
        for (const key in store) {
            const arr = store[key][p]?.[o];
            if (arr) {
                if (idx !== lastIdx) arr[idx] = arr[lastIdx];
                arr.pop();
            }
        }
    }
}

function clearRelationDataInternal(
    store: any,
    type: string,
    eid: number,
    _idx: number,
    exclusive: boolean
): void {
    if (!exclusive) return;
    const p = eid >>> 10,
        o = eid & 1023;
    if (type === 'aos') {
        if (store[p]) store[p][o] = undefined;
    } else {
        for (const key in store) {
            if (store[key][p]) store[key][p][o] = undefined;
        }
    }
}

export function removeAllRelationTargets(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    entity: Entity
): void {
    const targets = getRelationTargets(ctx, relation, entity);
    for (const target of targets) {
        removeRelationTarget(ctx, relation, entity, target);
    }
}

export function getEntitiesWithRelationTo(
    ctx: WorldInternal,
    relation: Relation<Trait>,
    target: Entity
): readonly Entity[] {
    const baseTrait = relation[$internal].trait;
    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData || !traitData.relationSources) return [];

    const sources = traitData.relationSources[getEntityId(target)];
    return sources ? sources.slice() : [];
}

export function setRelationDataAtIndex(
    ctx: WorldInternal,
    entity: Entity,
    relation: Relation<Trait>,
    targetIndex: number,
    value: Record<string, unknown>
): void {
    const relationCtx = relation[$internal];
    const baseTrait = relationCtx.trait;
    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData) return;

    const store = traitData.store;
    const eid = getEntityId(entity);
    const p = eid >>> 10,
        o = eid & 1023;

    if (baseTrait[$internal].type === 'aos') {
        const page = ensureRelPage(store as any[], p);
        if (relationCtx.exclusive) {
            page[o] = value;
        } else {
            (page[o] ??= [])[targetIndex] = value;
        }
        return;
    }

    const storeRec = store as Record<string, any[]>;
    if (relationCtx.exclusive) {
        for (const key in value) {
            ensureRelPage(storeRec[key], p)[o] = (value as Record<string, unknown>)[key];
        }
    } else {
        for (const key in value) {
            const kPage = ensureRelPage(storeRec[key], p);
            (kPage[o] ??= [])[targetIndex] = (value as Record<string, unknown>)[key];
        }
    }
}

export function setRelationData(
    ctx: WorldInternal,
    entity: Entity,
    relation: Relation<Trait>,
    target: Entity,
    value: Record<string, unknown>
): void {
    const targetIndex = getTargetIndex(ctx, relation, entity, target);
    if (targetIndex === -1) return;
    setRelationDataAtIndex(ctx, entity, relation, targetIndex, value);
}

export function getRelationData(
    ctx: WorldInternal,
    entity: Entity,
    relation: Relation<Trait>,
    target: Entity
): unknown {
    const baseTrait = relation[$internal].trait;
    const traitData = getTraitInstance(ctx.traitInstances, baseTrait);
    if (!traitData) return undefined;

    const targetIndex = getTargetIndex(ctx, relation, entity, target);
    if (targetIndex === -1) return undefined;

    const traitCtx = baseTrait[$internal];
    const store = traitData.store;
    const eid = getEntityId(entity);
    const p = eid >>> 10,
        o = eid & 1023;
    const relationCtx = relation[$internal];

    if (traitCtx.type === 'aos') {
        const page = (store as any[])[p];
        if (!page) return undefined;
        if (relationCtx.exclusive) {
            return page[o];
        } else {
            return page[o]?.[targetIndex];
        }
    } else {
        const result: Record<string, unknown> = {};
        const storeRecord = store as Record<string, any[]>;
        for (const key in store) {
            const kPage = storeRecord[key][p];
            if (!kPage) continue;
            if (relationCtx.exclusive) {
                result[key] = kPage[o];
            } else {
                result[key] = (kPage[o] as unknown[] | undefined)?.[targetIndex];
            }
        }
        return result;
    }
}

export function hasRelationPair(ctx: WorldInternal, entity: Entity, pair: RelationPair): boolean {
    const pairCtx = pair[$internal];
    const relation = pairCtx.relation;
    const target = pairCtx.target;

    if (!hasTrait(ctx, entity, relation[$internal].trait)) return false;

    if (target === '*') return true;

    if (typeof target === 'number') return hasRelationToTarget(ctx, relation, entity, target);

    return false;
}
