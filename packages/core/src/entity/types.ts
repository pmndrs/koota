import type {
    ConfigurableTrait,
    ExtractType,
    Relation,
    RelationPair,
    SetTraitCallback,
    Trait,
    TraitValue,
} from '../trait/types';

export type Entity = number & {
    add: (...traits: ConfigurableTrait[]) => void;
    remove: (...traits: (Trait | RelationPair)[]) => void;
    has: (trait: Trait | RelationPair) => boolean;
    destroy: () => void;
    changed: (trait: Trait) => void;
    set: <T extends Trait | RelationPair>(
        trait: T,
        value: Partial<ExtractType<T>> | SetTraitCallback<T>,
        flagChanged?: boolean
    ) => void;
    get: <T extends Trait | RelationPair>(trait: T) => ExtractType<T> | undefined;
    targetFor: (relation: Relation) => Entity | undefined;
    targetsFor: (relation: Relation) => Entity[];
    id: () => number;
    generation: () => number;
    isAlive: () => boolean;
};
