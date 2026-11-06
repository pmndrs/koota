import { endStructuralChanges } from '../world/settled';
import type { Entity } from '../entity/types';
import { isEntityAlive } from '../entity/utils/entity-index';
import { notifyChanged } from '../query/modifiers/changed';
import { addTrait, getTraitForTrait, removeTrait } from '../trait/trait';
import type { Trait } from '../trait/types';
import { getQueryBinding } from '../view/entity-view';
import { ListView, OrderedSource } from '../view/ordered-view';
import type { EntityComparator, MutableOrderedView } from '../view/types';
import type { WorldContext } from '../world';
import type { Relation } from './types';

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
    if (!isEntityAlive(this.ctx.entityIndex, entity)) {
      throw new Error('Koota: Ordered views require live entities in the same world.');
    }
    addTrait(this.ctx, entity, this.relation(this.parent));
    return this;
  }

  insert(entity: Entity, index: number): this {
    this.ctx.structuralDepth++;
    let result;
    try {
      result = this.insertInternal(entity, index);
    } catch (error) {
      this.ctx.structuralDepth--;
      throw error;
    }
    endStructuralChanges(this.ctx);
    return result;
  }

  private insertInternal(entity: Entity, index: number): this {
    this.assertActive();
    if (this.has(entity)) return this.moveTo(entity, index);
    const previous = this.inserting;
    const previousIndex = this.insertIndex;
    this.inserting = entity;
    this.insertIndex = index;
    try {
      this.add(entity);
    } finally {
      this.inserting = previous;
      this.insertIndex = previousIndex;
    }
    return this;
  }

  remove(entity: Entity): boolean {
    this.ctx.structuralDepth++;
    let result;
    try {
      result = this.removeInternal(entity);
    } catch (error) {
      this.ctx.structuralDepth--;
      throw error;
    }
    endStructuralChanges(this.ctx);
    return result;
  }

  private removeInternal(entity: Entity): boolean {
    this.assertActive();
    const index = this.indexOf(entity);
    if (index === -1) return false;
    this.source.write().splice(index, 1);
    removeTrait(this.ctx, entity, this.relation(this.parent));
    this.changed();
    return true;
  }

  clear(): void {
    this.ctx.structuralDepth++;
    let result;
    try {
      result = this.clearInternal();
    } catch (error) {
      this.ctx.structuralDepth--;
      throw error;
    }
    endStructuralChanges(this.ctx);
    return result;
  }

  private clearInternal(): void {
    this.assertActive();
    if (this.length === 0) return;
    const entities = this.source.dense;
    this.source.dense = [];
    for (const entity of entities) removeTrait(this.ctx, entity, this.relation(this.parent));
    this.changed();
  }

  moveTo(entity: Entity, index: number): this {
    this.assertActive();
    const from = this.indexOf(entity);
    if (from === -1) throw new Error('Koota: Entity is not in the ordered view.');
    index = Math.trunc(index) || 0;
    index = index < 0 ? Math.max(0, this.length + index) : Math.min(index, this.length - 1);
    if (from === index) return this;
    const entities = this.source.write();
    if (from < index) entities.copyWithin(from, from + 1, index + 1);
    else entities.copyWithin(index + 1, index, from);
    entities[index] = entity;
    this.changed();
    return this;
  }

  sort(compare: EntityComparator): this {
    this.assertActive();
    this.source.write().sort(compare);
    this.changed();
    return this;
  }

  reverse(): this {
    this.assertActive();
    this.source.write().reverse();
    this.changed();
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

  private assertActive() {
    if (
      !this.active ||
      !isEntityAlive(this.ctx.entityIndex, this.parent) ||
      getTraitForTrait(this.ctx, this.parent, this.trait, undefined) !== this
    ) {
      throw new Error('Koota: The ordered view is no longer attached to its owner.');
    }
  }

  private changed() {
    if (
      this.active &&
      isEntityAlive(this.ctx.entityIndex, this.parent) &&
      getTraitForTrait(this.ctx, this.parent, this.trait, undefined) === this
    ) {
      notifyChanged(this.ctx, this.parent, this.trait);
    }
  }
}
