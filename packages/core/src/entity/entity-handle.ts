import { $internal } from '../common';
import { setChanged } from '../query/modifiers/changed';
import { getFirstRelationTarget, getRelationTargets, hasRelationPair } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { addTrait, getTrait, hasTrait, removeTrait, setTrait } from '../trait/trait';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { World } from '../world';
import { destroyEntity } from './entity';
import type { Entity, EntityHandle, RawEntity } from './types';
import { getEntityGeneration, getEntityId } from './utils/pack-entity';

class EntityHandleImpl implements EntityHandle {
    readonly __entity_handle__ = true as const;
    world: World;
    raw: RawEntity;

    constructor(world: World, raw: RawEntity) {
        this.world = world;
        this.raw = raw;
    }

    add(...traits: ConfigurableTrait[]) {
        return addTrait(this.world, this.raw, ...traits);
    }

    remove(...traits: (Trait | RelationPair)[]) {
        return removeTrait(this.world, this.raw, ...traits);
    }

    has(trait: Trait | RelationPair) {
        if (isRelationPair(trait)) return hasRelationPair(this.world, this.raw, trait);
        return hasTrait(this.world, this.raw, trait);
    }

    destroy() {
        return destroyEntity(this.world, this.raw);
    }

    changed(trait: Trait) {
        return setChanged(this.world, this.raw, trait);
    }

    get(trait: Trait | RelationPair) {
        return getTrait(this.world, this.raw, trait);
    }

    set(trait: Trait | RelationPair, value: any, triggerChanged = true) {
        setTrait(this.world, this.raw, trait, value, triggerChanged);
    }

    targetsFor(relation: Relation<any>) {
        return getRelationTargets(this.world, relation, this.raw).map((raw) =>
            createEntityHandle(this.world, raw)
        );
    }

    targetFor(relation: Relation<any>) {
        const target = getFirstRelationTarget(this.world, relation, this.raw);
        return target === undefined ? undefined : createEntityHandle(this.world, target);
    }

    id() {
        return getEntityId(this.raw);
    }

    generation() {
        return getEntityGeneration(this.raw);
    }

    isAlive() {
        return this.world.has(this);
    }

    valueOf() {
        return this.raw;
    }

    [Symbol.toPrimitive]() {
        return this.raw;
    }
}

export function createEntityHandle(world: World, raw: RawEntity): Entity {
    const eid = getEntityId(raw);
    const cached = world[$internal].entityHandles[eid];
    if (cached) return cached;
    const handle = new EntityHandleImpl(world, raw);
    world[$internal].entityHandles[eid] = handle;
    return handle;
}

/** Fast path for spawn — we know the entity is new, skip cache lookup. */
export function createNewEntityHandle(world: World, raw: RawEntity): Entity {
    const eid = getEntityId(raw);
    const cached = world[$internal].entityHandles[eid];
    if (cached) return cached;
    const handle = new EntityHandleImpl(world, raw);
    world[$internal].entityHandles[eid] = handle;
    return handle;
}

export function createEntityCursor(world: World, raw: RawEntity): EntityHandle {
    return new EntityHandleImpl(world, raw);
}

export function resetEntityCursor(entity: EntityHandle, world: World, raw: RawEntity): EntityHandle {
    (entity as EntityHandleImpl).world = world;
    (entity as EntityHandleImpl).raw = raw;
    return entity;
}
