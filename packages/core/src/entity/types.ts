import type { Relation, RelationPair } from '../relation/types';
import type {
    ConfigurableTrait,
    ExtractSchema,
    SetTraitCallback,
    Trait,
    TraitRecord,
    TraitValue,
} from '../trait/types';
import type { World } from '../world';

export type RawEntity = number;

export interface EntityHandle {
    readonly __entity_handle__: true;
    readonly world: World;
    readonly raw: RawEntity;
    add: (...traits: ConfigurableTrait[]) => void;
    remove: (...traits: (Trait | RelationPair)[]) => void;
    has: (trait: Trait | RelationPair) => boolean;
    destroy: () => void;
    changed: (trait: Trait) => void;
    set: <T extends Trait | RelationPair>(
        trait: T,
        value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
        flagChanged?: boolean
    ) => void;
    get: <T extends Trait | RelationPair>(trait: T) => TraitRecord<ExtractSchema<T>> | undefined;
    targetFor: <T extends Trait>(relation: Relation<T>) => Entity | undefined;
    targetsFor: <T extends Trait>(relation: Relation<T>) => Entity[];
    id: () => number;
    generation: () => number;
    isAlive: () => boolean;
}

export type Entity = EntityHandle;

export function isEntityHandle(entity: Entity | RawEntity): entity is EntityHandle {
    return typeof entity === 'object' && entity !== null;
}

export function toRawEntity(entity: Entity | RawEntity): RawEntity {
    return isEntityHandle(entity) ? entity.raw : entity;
}
