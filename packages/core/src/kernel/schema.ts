/**
 * Schemas compile into column plans. Every field is a plain array column.
 * Numeric columns start as packed doubles and clear to 0 so they keep that
 * layout; typed-array columns can become an explicit schema option later.
 */

import type { Entity } from './id';
import type { World } from './world';

export type Column = unknown[];
/** Factories construct one value per entity and may read the entity. */
export type Factory = (world: World, entity: Entity) => unknown;
export type Schema = Record<string, unknown> | Factory;

export type ColumnPlan = {
  readonly aos: boolean;
  readonly fields: readonly string[];
  readonly numeric: readonly boolean[];
  readonly defaults: readonly unknown[];
  readonly factories: readonly (Factory | null)[];
};

export function compilePlan(schema: Schema | undefined | null): ColumnPlan | null {
  if (schema === undefined || schema === null) return null;
  if (typeof schema === 'function') {
    return { aos: true, fields: ['value'], numeric: [false], defaults: [undefined], factories: [schema] };
  }
  const fields = Object.keys(schema);
  if (fields.length === 0) return null;
  const numeric: boolean[] = [];
  const defaults: unknown[] = [];
  const factories: (Factory | null)[] = [];
  for (let i = 0; i < fields.length; i++) {
    const value = schema[fields[i]];
    if (value !== null && typeof value === 'object') {
      const kind = Array.isArray(value) ? 'array' : 'object';
      throw new Error(`Koota: ${fields[i]} is an ${kind}, which is not supported in traits.`);
    }
    numeric[i] = typeof value === 'number';
    factories[i] = typeof value === 'function' ? (value as Factory) : null;
    defaults[i] = typeof value === 'function' ? undefined : value;
  }
  return { aos: false, fields, numeric, defaults, factories };
}

const CHUNK = 4096;
// oxlint-disable-next-line unicorn/no-new-array -- Fixed-length filler pushed during growth.
const ZEROS: unknown[] = new Array(CHUNK).fill(0);
// oxlint-disable-next-line unicorn/no-new-array -- Fixed-length filler pushed during growth.
const UNDEFINEDS: unknown[] = new Array(CHUNK).fill(undefined);

/**
 * Exact-size packed column. Numeric columns take the double layout up front so
 * fractional writes never reshape them.
 */
export function allocateColumn(plan: ColumnPlan, field: number, capacity: number): Column {
  const numeric = plan.numeric[field];
  // oxlint-disable-next-line unicorn/no-new-array -- Allocates the exact capacity, then fill packs it.
  const column: unknown[] = new Array(capacity).fill(numeric ? 0 : undefined);
  if (numeric && capacity > 0) {
    column[0] = 0.5;
    column[0] = 0;
  }
  return column;
}

/**
 * Grows in place so column references stay valid. Pushing in chunks keeps the
 * backing store within about an eighth of the requested capacity.
 */
export function growColumn(column: Column, capacity: number, numeric: boolean): void {
  const filler = numeric ? ZEROS : UNDEFINEDS;
  let missing = capacity - column.length;
  while (missing > 0) {
    if (missing >= CHUNK) {
      column.push(...filler);
      missing -= CHUNK;
    } else {
      column.push(...filler.slice(0, missing));
      missing = 0;
    }
  }
}

export function clearSlot(column: Column, row: number, numeric: boolean): void {
  column[row] = numeric ? 0 : undefined;
}

export function readRecord(columns: readonly Column[], plan: ColumnPlan, row: number): unknown {
  if (plan.aos) return columns[0][row];
  const record: Record<string, unknown> = {};
  const fields = plan.fields;
  for (let i = 0; i < fields.length; i++) record[fields[i]] = columns[i][row];
  return record;
}

/** The current record with the supplied fields overlaid. AoS values replace the instance. */
export function mergeRecord(columns: readonly Column[], plan: ColumnPlan, row: number, value: unknown): unknown {
  if (plan.aos) return value;
  const source = value as Record<string, unknown>;
  const record: Record<string, unknown> = {};
  const fields = plan.fields;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    record[field] = field in source ? source[field] : columns[i][row];
  }
  return record;
}

/** SoA writes merge the supplied fields. AoS writes replace the instance. */
export function writeRecord(
  columns: readonly Column[],
  plan: ColumnPlan,
  row: number,
  value: unknown,
  partial: boolean
): void {
  if (plan.aos) {
    columns[0][row] = value;
    return;
  }
  const source = value as Record<string, unknown>;
  const fields = plan.fields;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (partial && !(field in source)) continue;
    columns[i][row] = source[field];
  }
}

/**
 * Constructs a row from the schema: factories run, defaults copy. An AoS
 * instance supplied by the caller is used as is, so no throwaway instance is
 * built. Supplied SoA values are not written here; they follow as a set.
 */
export function constructRow(
  columns: readonly Column[],
  plan: ColumnPlan,
  row: number,
  world: World,
  entity: Entity,
  instance: unknown
): void {
  if (plan.aos) {
    columns[0][row] = instance === undefined ? plan.factories[0]!(world, entity) : instance;
    return;
  }
  const fields = plan.fields;
  for (let i = 0; i < fields.length; i++) {
    const factory = plan.factories[i];
    columns[i][row] = factory ? factory(world, entity) : plan.defaults[i];
  }
}

/** The record `constructRow` would write, as an object for an add hook to edit. */
export function constructRecord(plan: ColumnPlan, world: World, entity: Entity, instance: unknown): unknown {
  if (plan.aos) return instance === undefined ? plan.factories[0]!(world, entity) : instance;
  const record: Record<string, unknown> = {};
  const fields = plan.fields;
  for (let i = 0; i < fields.length; i++) {
    const factory = plan.factories[i];
    record[fields[i]] = factory ? factory(world, entity) : plan.defaults[i];
  }
  return record;
}

/**
 * Constructs a row and applies a supplied value in one pass: supplied fields
 * win, other fields take their factory or default. This is the hook-free path
 * of "create, then set"; the observable result is identical.
 */
export function initializeRow(
  columns: readonly Column[],
  plan: ColumnPlan,
  row: number,
  world: World,
  entity: Entity,
  value: unknown
): void {
  if (plan.aos) {
    columns[0][row] = value === undefined ? plan.factories[0]!(world, entity) : value;
    return;
  }
  const source = value as Record<string, unknown> | undefined;
  const fields = plan.fields;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (source !== undefined && field in source) {
      columns[i][row] = source[field];
    } else {
      const factory = plan.factories[i];
      columns[i][row] = factory ? factory(world, entity) : plan.defaults[i];
    }
  }
}
