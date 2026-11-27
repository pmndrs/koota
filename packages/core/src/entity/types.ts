import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import type { Machine, MachineStates, TransitionSubscriber } from '../machine/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitHook,
  TraitInit,
  TraitOut,
  TraitRecord,
  TraitValue,
} from '../trait/types';
import type { WorldContext } from '../world/types';

/** Entity scoped hooks only fire for this entity, so the callback needs no identity check. */
type EntityHook = TraitHook;

/**
 * Program wide settings that a module augmentation can set. The isolated entry registers
 * entityMethods as false, so every type in a program that imports it follows.
 */
// oxlint-disable-next-line typescript/no-empty-object-type
export interface Register {}

/** T in a program whose entities carry methods, and nothing in one that registered them off. */
export type WithEntityMethods<T> = Register extends { entityMethods: false } ? unknown : T;

declare const $entityBrand: unique symbol;

/**
 * A packed numeric identity that only means something to the world that spawned it. It carries
 * methods that find that world, unless the program creates isolated worlds.
 */
export type Entity = number & { readonly [$entityBrand]: true } & WithEntityMethods<EntityMethods>;

/** Trait and relation reads require liveness. Read retained values through Removed query iteration. */
export type EntityMethods = {
  add: (...traits: ConfigurableTrait[]) => void;
  /** Set the value if the entity has the trait or pair, or add it with the value if it does not. */
  upsert: <T extends Trait | RelationPair>(trait: T, value: TraitInit<ExtractSchema<T>>) => void;
  remove: (...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]) => void;
  has: (trait: Trait | RelationPair | Identifier | IdentifierPair) => boolean;
  destroy: () => void;
  changed: (trait: Trait) => void;
  set: <T extends Trait | RelationPair>(
    trait: T,
    value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
    flagChanged?: boolean
  ) => void;
  get: {
    <T extends Trait | RelationPair>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
    /** Fills out in place and returns it, without allocating. */
    <T extends Trait | RelationPair, O extends TraitOut<T>>(trait: T, out: O): O | undefined;
  };
  targetFor: {
    <K extends IdentifierKey>(identifier: Identifier<K>): K | undefined;
    <T extends Trait>(relation: Relation<T>): Entity | undefined;
  };
  targetsFor: {
    <K extends IdentifierKey>(identifier: Identifier<K>): K[];
    <T extends Trait>(relation: Relation<T>): Entity[];
  };
  onTransition: <S extends MachineStates>(
    machine: Machine<S>,
    callback: TransitionSubscriber<S[keyof S]>
  ) => () => void;
  onAdd: EntityHook;
  onRemove: EntityHook;
  /** Reports future additions and writes. Removals use onRemove. */
  onChange: EntityHook;
  id: () => number;
  generation: () => number;
  isAlive: () => boolean;
};

export type EntityIndex = {
  /** The number of currently alive entities. */
  aliveCount: number;
  /** Reusable entries immediately after the alive region. Retained entries follow them. */
  freeCount: number;
  /** Counts every entity that left the alive region. Removal history reads it as a clock. */
  releases: number;
  /**
   * Packed entities in three regions: alive, reusable, retained. Eviction bumps the generation
   * before moving a retained entry into the reusable region.
   */
  dense: Entity[];
  /** Sparse: entityId -> index in dense (or undefined). */
  sparse: number[];
  /** Dense list of leased page IDs. */
  ownedPages: number[];
  /** Per-page cursor: next fresh offset to allocate from (parallel to ownedPages). */
  pageCursors: number[];
  /** Index into ownedPages of the page we're currently filling. */
  currentPageIdx: number;
  /** The world's own allocator, or the one worlds with entity methods share. */
  allocator: PageAllocator;
  /** The context recorded as the owner of every page the index leases. */
  owner: WorldContext;
  /** Extends the owner's page tables after the index leases a page past the ones they cover. */
  growTables: (owner: WorldContext, pageLimit: number) => void;
};

export type PageAllocator = {
  /** Per-page generation values (pageId -> Uint8Array(PAGE_SIZE)). */
  generations: (Uint8Array | undefined)[];
  /** Stack of released page IDs available for leasing. */
  freePages: number[];
  /** Next fresh page ID to allocate. */
  pageCursor: number;
  /**
   * Maps pageId -> owning WorldContext. A world that owns its allocator only finds itself here,
   * a cycle nothing else refers to. Worlds that share one are found through it by entity methods.
   */
  pageOwners: (WorldContext | null)[];
};
