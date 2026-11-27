import { runCommand } from '../command/buffer';
import { isEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { createSchemaAccessors } from '../storage/accessors';
import { notifyChanged, subscribeAll } from '../trait/hooks';
import { hasTraitMembership } from '../trait/membership';
import { ensureTraitInstance, getTraitInstance } from '../trait/registry';
import { createTraitDefinition } from '../trait/trait';
import type { Trait, TraitInstance } from '../trait/types';
import { ensureViewBinding } from '../view/binding';
import { ListView, OrderedSource } from '../view/ordered-view';
import type { EntityComparator, MutableOrderedView } from '../view/types';
import type { WorldContext } from '../world/types';
import { addRelationPair, removeRelationPair } from './pairs';
import { $orderedTargetsTrait } from './relation';
import { getRelationSources } from './targets';
import type { OrderedRelation, Relation, RelationPair } from './types';

export function ordered<T extends Trait>(relation: Relation<T>): OrderedRelation<T> {
  const schema = (): MutableOrderedView<[]> => {
    throw new Error('Koota: Add an ordered trait to an entity to create its view.');
  };
  const defaults = createSchemaAccessors(schema, 'aos');
  const orderedTrait = createTraitDefinition(schema, 'trait', {
    ...defaults,
    add: (ctx, index, store, value) => {
      if (value !== undefined) throw new Error('Koota: Ordered traits create their own views.');
      const entity = ctx.entityIndex.dense[ctx.entityIndex.sparse[index]];
      const entities = getRelationSources(ctx, relation, entity).slice();
      defaults.add(
        ctx,
        index,
        store,
        new RelationView(ctx, entity, relation, orderedTrait, entities)
      );
    },
    set: (ctx, index, store, value) => {
      if (value !== defaults.get(ctx, index, store)) {
        throw new Error('Koota: Mutate the ordered view instead of replacing it.');
      }
      return false;
    },
    remove: (ctx, index, store) => {
      (defaults.get(ctx, index, store) as RelationView).active = false;
    },
  }) as unknown as OrderedRelation<T>;

  orderedTrait[$internal].onRegister = registerOrdered;
  Object.defineProperty(orderedTrait, $orderedTargetsTrait, { value: { relation } });
  return orderedTrait;
}

export /* @pure */ function isOrderedTrait(trait: Trait | RelationPair): trait is OrderedRelation {
  return $orderedTargetsTrait in trait;
}

function registerOrdered(ctx: WorldContext, orderedInstance: TraitInstance): void {
  const {
    trait: orderedTrait,
    masks,
    bitflag,
    store,
  } = orderedInstance as TraitInstance<OrderedRelation>;
  const relation = orderedTrait[$orderedTargetsTrait].relation;
  const relationTrait = relation[$internal].trait;

  const relationInstance = ensureTraitInstance(ctx, relationTrait);

  const { entityIndex } = ctx;
  const traitCtx = orderedTrait[$internal];

  const getList = (parent: Entity): RelationView | undefined => {
    const eid = getEntityId(parent);
    return masks[eid >>> 10][(eid & 1023) << 2] & bitflag
      ? (traitCtx.get(ctx, eid, store) as RelationView)
      : undefined;
  };

  type RelationSub = (entity: Entity, target: Entity) => void;

  subscribeAll(relationInstance.addSubscriptions, ((child, parent) => {
    getList(parent)?.appendFromRelation(child);
  }) as RelationSub);

  subscribeAll(relationInstance.removeSubscriptions, ((child, parent) => {
    const eid = getEntityId(parent);
    const denseIdx = entityIndex.sparse[eid];
    if (denseIdx !== undefined && getEntityId(entityIndex.dense[denseIdx]) === eid) {
      getList(parent)?.removeFromRelation(child);
    }
  }) as RelationSub);
}

/**
 * Every edit is a command and applies under a scope. It decides membership when it applies and a
 * detached view applies nothing.
 */
function applyAdd(ctx: WorldContext, entity: Entity, view: RelationView) {
  if (view.isAttached()) addRelationPair(ctx, entity, view.relation(view.parent));
}

function applyRemove(ctx: WorldContext, entity: Entity, view: RelationView) {
  if (view.isAttached() && view.has(entity)) {
    removeRelationPair(ctx, entity, view.relation(view.parent));
  }
}

function applyInsert(ctx: WorldContext, entity: Entity, view: RelationView, index: number) {
  if (!view.isAttached()) return;
  if (view.has(entity)) return applyMove(ctx, entity, view, index);
  view.inserting = entity;
  view.insertIndex = index;
  try {
    addRelationPair(ctx, entity, view.relation(view.parent));
  } finally {
    view.inserting = undefined;
  }
}

function applyClear(ctx: WorldContext, _parent: Entity, view: RelationView) {
  if (!view.isAttached()) return;
  const entities = view.getSource().dense;
  if (entities.length === 0) return;
  const pair = view.relation(view.parent);
  view.source.dense = [];
  view.source.readers = 0;
  for (const entity of entities) removeRelationPair(ctx, entity, pair);
  view.changed();
}

function applyMove(_ctx: WorldContext, entity: Entity, view: RelationView, index: number) {
  if (!view.isAttached()) return;
  const from = view.indexOf(entity);
  if (from === -1) throw new Error('Koota: Entity is not in the ordered view.');
  index = Math.trunc(index) || 0;
  index = index < 0 ? Math.max(0, view.length + index) : Math.min(index, view.length - 1);
  if (from === index) return;
  const entities = view.source.write();
  if (from < index) entities.copyWithin(from, from + 1, index + 1);
  else entities.copyWithin(index + 1, index, from);
  entities[index] = entity;
  view.changed();
}

function applySort(
  _ctx: WorldContext,
  _parent: Entity,
  view: RelationView,
  compare: EntityComparator
) {
  if (!view.isAttached()) return;
  view.source.write().sort(compare);
  view.changed();
}

function applyReverse(_ctx: WorldContext, _parent: Entity, view: RelationView) {
  if (!view.isAttached()) return;
  view.source.write().reverse();
  view.changed();
}

/** Membership edits update relation pairs. Reordering only changes the owned sequence. */
class RelationView extends ListView implements MutableOrderedView<any> {
  parent: Entity;
  relation: Relation;
  trait: Trait;
  active = true;
  inserting: Entity | undefined = undefined;
  insertIndex = 0;

  constructor(
    ctx: WorldContext,
    parent: Entity,
    relation: Relation,
    trait: Trait,
    entities: Entity[]
  ) {
    super(ctx, new OrderedSource(entities), ensureViewBinding(ctx, null, []));
    this.parent = parent;
    this.relation = relation;
    this.trait = trait;
  }

  has(entity: Entity) {
    return this.getSource().dense.includes(entity);
  }

  indexOf(entity: Entity) {
    return this.getSource().dense.indexOf(entity);
  }

  add(entity: Entity): this {
    this.assertActive();
    this.assertAlive(entity);
    runCommand(this.ctx, applyAdd, entity, this, undefined);
    return this;
  }

  insert(entity: Entity, index: number): this {
    this.assertActive();
    this.assertAlive(entity);
    runCommand(this.ctx, applyInsert, entity, this, index);
    return this;
  }

  /** Reports current membership even when the removal is queued after an unseen addition. */
  remove(entity: Entity): boolean {
    this.assertActive();
    const present = this.has(entity);
    runCommand(this.ctx, applyRemove, entity, this, undefined);
    return present;
  }

  clear(): void {
    this.assertActive();
    runCommand(this.ctx, applyClear, this.parent, this, undefined);
  }

  moveTo(entity: Entity, index: number): this {
    this.assertActive();
    runCommand(this.ctx, applyMove, entity, this, index);
    return this;
  }

  sort(compare: EntityComparator): this {
    this.assertActive();
    runCommand(this.ctx, applySort, this.parent, this, compare);
    return this;
  }

  reverse(): this {
    this.assertActive();
    runCommand(this.ctx, applyReverse, this.parent, this, undefined);
    return this;
  }

  /** The relation sync found this view on its live parent, so it is attached. */
  appendFromRelation(entity: Entity): void {
    const entities = this.source.write();
    if (this.inserting === entity) entities.splice(this.insertIndex, 0, entity);
    else entities.push(entity);
    notifyChanged(this.ctx, this.parent, this.trait);
  }

  /** The relation sync found this view on its live parent, so it is attached. */
  removeFromRelation(entity: Entity): void {
    if (this.source.drop(entity)) notifyChanged(this.ctx, this.parent, this.trait);
  }

  isAttached() {
    const { ctx, parent, trait } = this;
    if (
      !this.active ||
      !isEntityAlive(ctx.entityIndex, parent) ||
      !hasTraitMembership(ctx, parent, trait)
    ) {
      return false;
    }
    const store = getTraitInstance(ctx.traitInstances, trait)!.store;
    return trait[$internal].get(ctx, getEntityId(parent), store) === this;
  }

  assertActive() {
    if (!this.isAttached()) {
      throw new Error('Koota: The ordered view is no longer attached to its owner.');
    }
  }

  assertAlive(entity: Entity) {
    if (!isEntityAlive(this.ctx.entityIndex, entity)) {
      throw new Error('Koota: Ordered views require live entities in the same world.');
    }
  }

  changed() {
    if (this.isAttached()) notifyChanged(this.ctx, this.parent, this.trait);
  }
}
