import { W as World, Q as QueryParameter, p as QueryResult, E as Entity, g as TagTrait, d as Trait, B as RelationPair, R as Relation, K as TraitRecord } from '../dist/types-76FXljzE.js';
import * as react_jsx_runtime from 'react/jsx-runtime';

declare function useActions<T extends Record<string, (...args: any[]) => any>>(actions: (world: World) => T): T;

declare function useQuery<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;

declare function useQueryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;

declare function useTag(target: Entity | World | undefined | null, tag: TagTrait): boolean;

declare function useHas(target: Entity | World | undefined | null, trait: Trait | RelationPair): boolean;

declare function useTarget<T extends Trait>(target: Entity | World | undefined | null, relation: Relation<T>): Entity | undefined;

declare function useTargets<T extends Trait>(target: Entity | World | undefined | null, relation: Relation<T>): Entity[];

/**
 * Making sure the values are never stale requires syncing at each boundary.
 *
 * - Render: Read the current trait snapshot synchronously.
 * - Effect: Update again after subscribing at effect time. This catches any
 *   changes that happen after render but before effect.
 * - Subscribe: Whenever the trait value changes in the world.
 */
declare function useTrait<T extends Trait>(target: Entity | World | undefined | null, trait: T | RelationPair<T>): TraitRecord<T> | undefined;

declare function useTraitEffect<T extends Trait>(target: Entity | World, trait: T, callback: (value: TraitRecord<T> | undefined) => void): void;
declare function useTraitEffect<T extends Trait>(target: Entity | World, trait: RelationPair<T>, callback: (value: TraitRecord<T> | undefined) => void): void;

declare function useWorld(): World;

declare function WorldProvider({ children, world }: {
    children: React.ReactNode;
    world: World;
}): react_jsx_runtime.JSX.Element;

export { WorldProvider, useActions, useHas, useQuery, useQueryFirst, useTag, useTarget, useTargets, useTrait, useTraitEffect, useWorld };
