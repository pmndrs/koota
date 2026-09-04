import { $internal, type Relation, type Trait } from '@koota/core';
import type { SourceInfo } from '../../types';

export type TraitType = 'tag' | 'soa' | 'aos' | 'rel';

interface DebugCarrier {
  debugName?: unknown;
  debugSource?: unknown;
}

export function getTraitId(trait: Trait): number {
  return trait[$internal].id;
}

export function getTraitRelation(trait: Trait): Relation<Trait> | null {
  return trait[$internal].relation;
}

export function getTraitType(trait: Trait): TraitType {
  const ctx = trait[$internal];
  return ctx.relation !== null ? 'rel' : ctx.type;
}

/**
 * The bundler plugin attaches debug metadata to the trait it sees in source.
 * For relations that is the relation itself, not the trait koota derives from it.
 */
function getDebugCarrier(trait: Trait): DebugCarrier {
  return (trait[$internal].relation ?? trait) as unknown as DebugCarrier;
}

export function getTraitName(trait: Trait): string {
  const { debugName } = getDebugCarrier(trait);
  if (typeof debugName === 'string') return debugName;

  const ctx = trait[$internal];
  return ctx.relation !== null ? `Relation#${ctx.id}` : `Trait#${ctx.id}`;
}

export function getTraitSource(trait: Trait): SourceInfo | undefined {
  const { debugSource } = getDebugCarrier(trait);
  return isSourceInfo(debugSource) ? debugSource : undefined;
}

export function isSourceInfo(value: unknown): value is SourceInfo {
  if (typeof value !== 'object' || value === null) return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.file === 'string' &&
    typeof source.line === 'number' &&
    typeof source.column === 'number'
  );
}

export function getSchemaKeys(trait: Trait): string[] {
  if (trait[$internal].type === 'tag') return [];
  return Object.keys(trait.schema ?? {});
}

/**
 * Tags carry no data and an empty SoA schema has nothing to show. AoS values
 * are opaque objects that can always be inspected.
 */
export function hasInspectableData(trait: Trait): boolean {
  const type = trait[$internal].type;
  if (type === 'tag') return false;
  if (type === 'aos') return true;
  return getSchemaKeys(trait).length > 0;
}

export function compareTraitNames(a: Trait, b: Trait): number {
  return getTraitName(a).localeCompare(getTraitName(b));
}

export function matchesTraitFilter(trait: Trait, filter: string): boolean {
  return getTraitName(trait).toLowerCase().includes(filter.toLowerCase());
}
