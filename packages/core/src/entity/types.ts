import type {
    TraitLike,
    ExtractType,
    Relation,
    Pair,
    PairPattern,
    SetTraitCallback,
    Trait,
    TraitValue,
} from '../trait/types';

export type Entity = number & {
    add: (...traits: TraitLike[]) => void;
    remove: (...traits: (Trait | PairPattern)[]) => void;
    has: (trait: Trait | PairPattern) => boolean;
    destroy: () => void;
    changed: (trait: Trait) => void;
    set: <T extends Trait | Pair>(
        trait: T,
        value: Partial<ExtractType<T>> | SetTraitCallback<T>,
        flagChanged?: boolean
    ) => void;
    get: <T extends Trait | Pair>(trait: T) => ExtractType<T> | undefined;
    targetFor: (relation: Relation) => Entity | undefined;
    targetsFor: (relation: Relation) => Entity[];
    id: () => number;
    generation: () => number;
    isAlive: () => boolean;
};
