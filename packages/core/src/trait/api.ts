import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { World } from '../world';
import { addPair, getPair, hasPair, removePair, setPair } from './relation';
import { addTrait, getTrait, hasTrait, removeTrait, setTrait } from './trait';
import type { Pair, PairPattern, Relation, Trait, TraitLike } from './types';
import { isPair, isPairPattern } from './utils/is-relation';

export function add(world: World, entity: Entity, ...inputs: TraitLike[]) {
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];

        if (isPair(input)) {
            const [relation, target, params] = input;
            addPair(world, entity, relation, target, params);
        } else if (Array.isArray(input)) {
            const [trait, params] = input;
            addTrait(world, entity, trait, params);
        } else {
            addTrait(world, entity, input as Trait);
        }
    }
}

export function remove(world: World, entity: Entity, ...inputs: (Trait | PairPattern)[]) {
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];

        if (isPairPattern(input)) {
            const [relation, target] = input;
            removePair(world, entity, relation, target);
        } else {
            const t = input as Trait;
            if (t[$internal].mode === 'binary') {
                removePair(world, entity, t as Relation, '*');
            } else {
                removeTrait(world, entity, t);
            }
        }
    }
}

export function has(world: World, entity: Entity, member: Trait | PairPattern): boolean {
    if (isPairPattern(member)) return hasPair(world, entity, member);
    return hasTrait(world, entity, member);
}

export function get(world: World, entity: Entity, traitOrPair: Trait | Pair) {
    if (isPair(traitOrPair)) {
        const [relation, target] = traitOrPair;
        return getPair(world, entity, relation, target as Entity);
    }
    return getTrait(world, entity, traitOrPair);
}

export function set(
    world: World,
    entity: Entity,
    traitOrPair: Trait | Pair,
    value: any,
    triggerChanged = true
) {
    if (isPair(traitOrPair)) {
        const [relation, target] = traitOrPair;
        setPair(world, entity, relation, target as Entity, value, triggerChanged);
    } else {
        setTrait(world, entity, traitOrPair, value, triggerChanged);
    }
}
