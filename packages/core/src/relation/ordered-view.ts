import { beginDefer, deferCommand, endDefer } from '../world/defer';
import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/utils/entity-index';
import { notifyChanged } from '../query/modifiers/changed';
import { applyAddTrait, applyRemoveTrait, getTraitForTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { getQueryBinding } from '../view/entity-view';
import { ListView, OrderedSource } from '../view/ordered-view';
import type { EntityComparator, MutableOrderedView } from '../view/types';
import type { WorldContext } from '../world';
import type { ConfigurablePair, Relation } from './types';

/** Deferred edits decide membership when they apply. A detached view applies nothing. */
function addNow(ctx: WorldContext, entity: Entity, view: RelationView) {
  if (view.isAttached()) applyAddTrait(ctx, entity, [view.relation(view.parent) as ConfigurablePair]);
}

function removeNow(ctx: WorldContext, entity: Entity, view: RelationView) {
  if (view.isAttached() && view.has(entity)) {
    applyRemoveTrait(ctx, entity, [view.relation(view.parent) as ConfigurablePair]);
  }
}

function insertNow(ctx: WorldContext, entity: Entity, view: RelationView, index: number) {
  if (!view.isAttached()) return;
  if (view.has(entity)) return moveNow(ctx, entity, view, index);
  beginDefer(ctx);
  view.inserting = entity;
  view.insertIndex = index;
  try {
    applyAddTrait(ctx, entity, [view.relation(view.parent) as ConfigurablePair]);
  } finally {
    view.inserting = undefined;
    endDefer(ctx);
  }
}

function clearNow(ctx: WorldContext, _parent: Entity, view: RelationView) {
  if (!view.isAttached() || view.length === 0) return;
  const entities = view.source.dense;
  view.source.dense = [];
  beginDefer(ctx);
  try {
    for (const entity of entities)
      applyRemoveTrait(ctx, entity, [view.relation(view.parent) as ConfigurablePair]);
    view.changed();
  } finally {
    endDefer(ctx);
  }
}

function moveNow(_ctx: WorldContext, entity: Entity, view: RelationView, index: number) {
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

function sortNow(ctx: WorldContext, _parent: Entity, view: RelationView, compare: EntityComparator) {
  if (!view.isAttached()) return;
  beginDefer(ctx);
  try {
    view.source.write().sort(compare);
    view.changed();
  } finally {
    endDefer(ctx);
  }
}

function reverseNow(_ctx: WorldContext, _parent: Entity, view: RelationView) {
  if (!view.isAttached()) return;
  view.source.write().reverse();
  view.changed();
}

/** Membership edits update relation pairs. Reordering only changes the owned sequence. */
export class RelationView extends ListView implements MutableOrderedView<any> {
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
    super(ctx, new OrderedSource(entities), getQueryBinding(ctx, null, []));
    this.parent = parent;
    this.relation = relation;
    this.trait = trait;
  }

  has(entity: Entity) {
    return this.source.dense.includes(entity);
  }

  indexOf(entity: Entity) {
    return this.source.dense.indexOf(entity);
  }

  add(entity: Entity): this {
    this.assertActive();
    this.assertAlive(entity);
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, addNow, entity, this, undefined);
    else addNow(this.ctx, entity, this);
    return this;
  }

  insert(entity: Entity, index: number): this {
    this.assertActive();
    this.assertAlive(entity);
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, insertNow, entity, this, index);
    else insertNow(this.ctx, entity, this, index);
    return this;
  }

  /** Reports current membership even when the removal is queued after an unseen addition. */
  remove(entity: Entity): boolean {
    this.assertActive();
    const present = this.has(entity);
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, removeNow, entity, this, undefined);
    else removeNow(this.ctx, entity, this);
    return present;
  }

  clear(): void {
    this.assertActive();
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, clearNow, this.parent, this, undefined);
    else clearNow(this.ctx, this.parent, this);
  }

  moveTo(entity: Entity, index: number): this {
    this.assertActive();
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, moveNow, entity, this, index);
    else moveNow(this.ctx, entity, this, index);
    return this;
  }

  sort(compare: EntityComparator): this {
    this.assertActive();
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, sortNow, this.parent, this, compare);
    else sortNow(this.ctx, this.parent, this, compare);
    return this;
  }

  reverse(): this {
    this.assertActive();
    if (this.ctx.deferDepth !== 0) deferCommand(this.ctx, reverseNow, this.parent, this, undefined);
    else reverseNow(this.ctx, this.parent, this);
    return this;
  }

  appendFromRelation(entity: Entity): void {
    const entities = this.source.write();
    if (this.inserting === entity) entities.splice(this.insertIndex, 0, entity);
    else entities.push(entity);
    this.changed();
  }

  removeFromRelation(entity: Entity): void {
    const index = this.indexOf(entity);
    if (index === -1) return;
    this.source.write().splice(index, 1);
    this.changed();
  }

  isAttached() {
    return (
      this.active &&
      isEntityAlive(this.ctx.entityIndex, this.parent) &&
      getTraitForTrait(this.ctx, this.parent, this.trait, undefined) === this
    );
  }

  private assertActive() {
    if (!this.isAttached()) {
      throw new Error('Koota: The ordered view is no longer attached to its owner.');
    }
  }

  private assertAlive(entity: Entity) {
    if (!isEntityAlive(this.ctx.entityIndex, entity)) {
      throw new Error('Koota: Ordered views require live entities in the same world.');
    }
  }

  changed() {
    if (this.isAttached()) notifyChanged(this.ctx, this.parent, this.trait);
  }
}
