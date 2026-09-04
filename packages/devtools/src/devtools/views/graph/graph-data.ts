import type { Entity, Relation, Trait, World } from '@koota/core';
import { $internal, IsExcluded } from '@koota/core';
import {
  IsDevtoolsHighlighting,
  IsDevtoolsHovered,
  IsDevtoolsHovering,
  IsDevtoolsSelected,
  IsDevtoolsSelecting,
} from '../../../traits';
import { getTraitId, getTraitName, getTraitRelation } from '../../model/trait-info';

/**
 * Traits that never contribute to an entity's archetype. Devtools tags flip on hover and
 * select and would otherwise move entities between groups while the user interacts.
 */
const IGNORED_TRAITS = new Set<Trait>([
  IsDevtoolsHovered,
  IsDevtoolsSelected,
  IsDevtoolsHovering,
  IsDevtoolsSelecting,
  IsDevtoolsHighlighting,
  IsExcluded,
]);

/** Siblings shown individually before they collapse into one aggregate node. */
export const AGGREGATION_THRESHOLD = 5;

/** Longest node label that still fits comfortably in the panel. */
const MAX_LABEL_LENGTH = 22;

export interface RelationRecord {
  trait: Trait;
  relation: Relation<Trait>;
  name: string;
  exclusive: boolean;
}

/** Resolve the relation behind each relation trait, optionally narrowed by name. */
export function resolveRelations(relationTraits: Trait[], selectedNames: Set<string>) {
  const records: RelationRecord[] = [];
  for (const trait of relationTraits) {
    const relation = getTraitRelation(trait);
    if (!relation) continue;
    const name = getTraitName(trait);
    if (selectedNames.size > 0 && !selectedNames.has(name)) continue;
    records.push({ trait, relation, name, exclusive: relation[$internal].exclusive });
  }
  // A fixed order keeps layouts stable across rebuilds.
  records.sort((a, b) => getTraitId(a.trait) - getTraitId(b.trait));
  return records;
}

/* Archetypes --------------------------------------------------------------------------------- */

export interface Archetype {
  /** Stable identity: sorted ids of the data traits on the entity. */
  key: string;
  traits: Trait[];
  /** Short label for a node, e.g. "Bullet · Transform +2". */
  label: string;
  /** Every trait name, for tooltips and sheet titles. */
  fullLabel: string;
}

const archetypeCache = new WeakMap<World, Map<string, Archetype>>();

function isDataTrait(trait: Trait): boolean {
  return !IGNORED_TRAITS.has(trait) && getTraitRelation(trait) === null;
}

/** Group entities by the data traits they carry. Relation traits are the edges, not the type. */
export function getArchetype(world: World, entity: Entity): Archetype {
  const ctx = world[$internal];
  const isWorld = entity === ctx.worldEntity;
  const traits = [...(ctx.entityTraits.get(entity) ?? [])].filter(isDataTrait);
  traits.sort((a, b) => getTraitId(a) - getTraitId(b));
  const key = isWorld ? 'world' : traits.map(getTraitId).join(',');

  let cache = archetypeCache.get(world);
  if (!cache) {
    cache = new Map();
    archetypeCache.set(world, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached;

  const archetype = buildArchetype(key, traits, isWorld);
  cache.set(key, archetype);
  return archetype;
}

/** "A · B +2", falling back to "A +3" and finally a hard truncation when names are long. */
function shortLabel(names: string[]): string {
  for (let shown = Math.min(2, names.length); shown >= 1; shown--) {
    const rest = names.length - shown;
    const head = names.slice(0, shown).join(' · ');
    const label = rest > 0 ? `${head} +${rest}` : head;
    if (label.length <= MAX_LABEL_LENGTH) return label;
  }
  const rest = names.length - 1;
  const suffix = rest > 0 ? ` +${rest}` : '';
  return `${names[0].slice(0, MAX_LABEL_LENGTH - suffix.length - 1)}…${suffix}`;
}

function buildArchetype(key: string, traits: Trait[], isWorld: boolean): Archetype {
  if (isWorld) return { key, traits, label: 'World', fullLabel: 'World entity' };
  if (traits.length === 0) return { key, traits, label: 'untyped', fullLabel: 'No data traits' };

  // Tags read like type names ("Player", "Bullet"), so they lead the label.
  const named = [...traits].sort((a, b) => {
    const aTag = a[$internal].type === 'tag' ? 0 : 1;
    const bTag = b[$internal].type === 'tag' ? 0 : 1;
    if (aTag !== bTag) return aTag - bTag;
    return getTraitName(a).localeCompare(getTraitName(b));
  });
  const names = named.map(getTraitName);
  return { key, traits: named, label: shortLabel(names), fullLabel: names.join(', ') };
}

/* Schema graph: archetype → relation → archetype --------------------------------------------- */

export interface SchemaNode {
  id: string;
  archetype: Archetype;
  /** Entities of this archetype that take part in at least one visible relation. */
  entities: Entity[];
}

export interface SchemaEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationRecord;
  /** Number of (source entity, target entity) pairs this edge summarizes. */
  count: number;
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  /** Total relation pairs shown. */
  pairCount: number;
}

export function buildSchemaGraph(world: World, relations: RelationRecord[]): SchemaGraph {
  const nodes = new Map<string, SchemaNode>();
  const members = new Map<string, Set<Entity>>();
  const edges = new Map<string, SchemaEdge>();
  let pairCount = 0;

  const touch = (entity: Entity): string => {
    const archetype = getArchetype(world, entity);
    const id = `arch:${archetype.key}`;
    let set = members.get(id);
    if (!set) {
      set = new Set();
      members.set(id, set);
      nodes.set(id, { id, archetype, entities: [] });
    }
    set.add(entity);
    return id;
  };

  for (const rel of relations) {
    for (const entity of world.query(rel.trait)) {
      const targets = entity.targetsFor(rel.relation);
      if (targets.length === 0) continue;
      const sourceId = touch(entity);
      for (const target of targets) {
        if (!world.has(target)) continue;
        const targetId = touch(target);
        const edgeId = `${sourceId}|${getTraitId(rel.trait)}|${targetId}`;
        const edge = edges.get(edgeId);
        if (edge) edge.count++;
        else
          edges.set(edgeId, {
            id: edgeId,
            source: sourceId,
            target: targetId,
            relation: rel,
            count: 1,
          });
        pairCount++;
      }
    }
  }

  for (const [id, node] of nodes) {
    node.entities = [...(members.get(id) ?? [])].sort((a, b) => a - b);
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.archetype.key.localeCompare(b.archetype.key)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    pairCount,
  };
}

/* Focus graph: one entity and its immediate neighbors ---------------------------------------- */

export type FocusNode =
  | { id: string; kind: 'focus'; entity: Entity }
  | { id: string; kind: 'entity'; entity: Entity }
  | {
      id: string;
      kind: 'aggregate';
      archetype: Archetype;
      relation: RelationRecord;
      direction: 'in' | 'out';
      entities: Entity[];
    };

export interface FocusEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationRecord;
  count: number;
}

export interface FocusGraph {
  focus: Entity;
  focusId: string;
  nodes: FocusNode[];
  edges: FocusEdge[];
}

export function buildFocusGraph(world: World, relations: RelationRecord[], focus: Entity) {
  const focusId = `ent:${focus}`;
  const nodes: FocusNode[] = [{ id: focusId, kind: 'focus', entity: focus }];
  const edges: FocusEdge[] = [];

  // (direction, relation, archetype) → neighbors
  const buckets = new Map<
    string,
    { relation: RelationRecord; archetype: Archetype; direction: 'in' | 'out'; entities: Entity[] }
  >();
  const bucket = (relation: RelationRecord, direction: 'in' | 'out', neighbor: Entity) => {
    const archetype = getArchetype(world, neighbor);
    const key = `${direction}|${getTraitId(relation.trait)}|${archetype.key}`;
    let b = buckets.get(key);
    if (!b) {
      b = { relation, archetype, direction, entities: [] };
      buckets.set(key, b);
    }
    b.entities.push(neighbor);
  };

  for (const rel of relations) {
    if (focus.has(rel.trait)) {
      for (const target of focus.targetsFor(rel.relation)) {
        if (world.has(target)) bucket(rel, 'out', target);
      }
    }
    for (const entity of world.query(rel.trait)) {
      if (entity === focus) continue;
      if (entity.targetsFor(rel.relation).includes(focus)) bucket(rel, 'in', entity);
    }
  }

  const seen = new Set<string>();
  const sorted = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [key, b] of sorted) {
    b.entities.sort((x, y) => x - y);
    const relId = getTraitId(b.relation.trait);

    if (b.entities.length > AGGREGATION_THRESHOLD) {
      const id = `agg:${key}`;
      nodes.push({
        id,
        kind: 'aggregate',
        archetype: b.archetype,
        relation: b.relation,
        direction: b.direction,
        entities: b.entities,
      });
      const [source, target] = b.direction === 'in' ? [id, focusId] : [focusId, id];
      edges.push({
        id: `${source}|${relId}|${target}`,
        source,
        target,
        relation: b.relation,
        count: b.entities.length,
      });
      continue;
    }

    for (const entity of b.entities) {
      const id = `ent:${entity}`;
      if (!seen.has(id)) {
        seen.add(id);
        nodes.push({ id, kind: 'entity', entity });
      }
      const [source, target] = b.direction === 'in' ? [id, focusId] : [focusId, id];
      edges.push({
        id: `${source}|${relId}|${target}`,
        source,
        target,
        relation: b.relation,
        count: 1,
      });
    }
  }

  return { focus, focusId, nodes, edges } satisfies FocusGraph;
}

/* Tree: hierarchical view of a single relation ----------------------------------------------- */

export interface TreeRow {
  entity: Entity;
  depth: number;
  /** Direct children (entities pointing at this one). */
  childCount: number;
  /** True when this entity already appeared on the path above (a cycle). */
  repeated: boolean;
}

export interface TreeData {
  roots: Entity[];
  children: Map<Entity, Entity[]>;
  /** Sources whose targets are all gone. */
  dangling: Entity[];
}

export function buildTree(world: World, relation: RelationRecord): TreeData {
  const children = new Map<Entity, Entity[]>();
  const sources = new Set<Entity>();
  const dangling: Entity[] = [];

  for (const entity of world.query(relation.trait)) {
    const targets = entity.targetsFor(relation.relation).filter((t) => world.has(t));
    if (targets.length === 0) {
      dangling.push(entity);
      continue;
    }
    sources.add(entity);
    for (const target of targets) {
      let list = children.get(target);
      if (!list) {
        list = [];
        children.set(target, list);
      }
      list.push(entity);
    }
  }

  for (const list of children.values()) list.sort((a, b) => a - b);

  // Roots are targets that do not themselves point anywhere.
  const roots = [...children.keys()].filter((t) => !sources.has(t)).sort((a, b) => a - b);

  // A pure cycle has no root; surface one member so nothing stays hidden.
  if (roots.length === 0 && children.size > 0) {
    roots.push([...children.keys()].sort((a, b) => a - b)[0]);
  }

  return { roots, children, dangling: dangling.sort((a, b) => a - b) };
}

/** Flatten a tree for rendering, honoring collapsed nodes and guarding against cycles. */
export function flattenTree(tree: TreeData, collapsed: Set<Entity>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (entity: Entity, depth: number, path: Set<Entity>) => {
    const kids = tree.children.get(entity) ?? [];
    const repeated = path.has(entity);
    rows.push({ entity, depth, childCount: kids.length, repeated });
    if (repeated || collapsed.has(entity)) return;
    path.add(entity);
    for (const child of kids) visit(child, depth + 1, path);
    path.delete(entity);
  };
  for (const root of tree.roots) visit(root, 0, new Set());
  return rows;
}
