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

/** Longest node label that still fits comfortably in the panel. */
const MAX_LABEL_LENGTH = 14;

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
  /** Title for a node: the leading trait name, e.g. "Bullet". */
  label: string;
  /** Traits that did not fit in the title. */
  hiddenTraits: number;
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

/**
 * One name only: the panel is narrow and two archetypes must sit side by side at full size.
 * The rest is spelled out on the node's second line and in full in the tooltip and sheet.
 */
function shortLabel(names: string[]): { label: string; shown: number } {
  const first = names[0];
  const label = first.length <= MAX_LABEL_LENGTH ? first : `${first.slice(0, MAX_LABEL_LENGTH - 1)}…`;
  return { label, shown: 1 };
}

function buildArchetype(key: string, traits: Trait[], isWorld: boolean): Archetype {
  if (isWorld) return { key, traits, label: 'World', hiddenTraits: 0, fullLabel: 'World entity' };
  if (traits.length === 0) {
    return { key, traits, label: 'untyped', hiddenTraits: 0, fullLabel: 'No data traits' };
  }

  // Tags read like type names ("Player", "Bullet"), so they lead the label.
  const named = [...traits].sort((a, b) => {
    const aTag = a[$internal].type === 'tag' ? 0 : 1;
    const bTag = b[$internal].type === 'tag' ? 0 : 1;
    if (aTag !== bTag) return aTag - bTag;
    return getTraitName(a).localeCompare(getTraitName(b));
  });
  const names = named.map(getTraitName);
  const { label, shown } = shortLabel(names);
  return {
    key,
    traits: named,
    label,
    hiddenTraits: names.length - shown,
    fullLabel: names.join(', '),
  };
}

/* Entity graph: entities that relate, merged when they are structurally identical ---------- */

export interface EntityGroup {
  id: string;
  archetype: Archetype;
  /** Members, sorted. */
  entities: Entity[];
  /** The member, when the group is a single entity. */
  entity: Entity | null;
  /** Singled out by the user; never merged with look-alikes. */
  pinned: boolean;
}

export interface EntityGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationRecord;
  /** Number of (source entity, target entity) pairs this edge summarizes. */
  count: number;
}

export interface EntityGraph {
  nodes: EntityGroup[];
  edges: EntityGraphEdge[];
  entityCount: number;
  pairCount: number;
}

/**
 * How many rounds of neighborhood refinement decide equivalence. One round merges entities
 * with the same traits and the same relations to the same kinds of entity; a second round
 * also looks at what those neighbors relate to. More rounds split hairs nobody can see.
 */
const REFINEMENT_ROUNDS = 2;

/** FNV-1a, so group ids stay short and stable across rebuilds. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Every entity that takes part in a relation is a node. Entities that cannot be told apart
 * by their traits and their relations collapse into one group node, so a hundred bullets
 * fired by the player are one node while an enemy chasing something else stands alone.
 */
export function buildEntityGraph(
  world: World,
  relations: RelationRecord[],
  pinned: Set<Entity>
): EntityGraph {
  const pairs: { source: Entity; relation: RelationRecord; target: Entity }[] = [];
  const entities = new Set<Entity>();

  for (const rel of relations) {
    for (const source of world.query(rel.trait)) {
      for (const target of source.targetsFor(rel.relation)) {
        if (!world.has(target)) continue;
        pairs.push({ source, relation: rel, target });
        entities.add(source);
        entities.add(target);
      }
    }
  }

  // Color refinement: start from the archetype, then fold in the neighbors' colors.
  let color = new Map<Entity, string>();
  for (const entity of entities) {
    color.set(
      entity,
      pinned.has(entity) ? `pin:${entity}` : `arch:${getArchetype(world, entity).key}`
    );
  }

  for (let round = 0; round < REFINEMENT_ROUNDS; round++) {
    const outgoing = new Map<Entity, Set<string>>();
    const incoming = new Map<Entity, Set<string>>();
    for (const { source, relation, target } of pairs) {
      const relId = getTraitId(relation.trait);
      let out = outgoing.get(source);
      if (!out) outgoing.set(source, (out = new Set()));
      out.add(`${relId}>${color.get(target)}`);
      let inc = incoming.get(target);
      if (!inc) incoming.set(target, (inc = new Set()));
      inc.add(`${relId}<${color.get(source)}`);
    }

    const next = new Map<Entity, string>();
    for (const entity of entities) {
      const own = color.get(entity)!;
      if (own.startsWith('pin:')) {
        next.set(entity, own);
        continue;
      }
      const out = [...(outgoing.get(entity) ?? [])].sort().join(',');
      const inc = [...(incoming.get(entity) ?? [])].sort().join(',');
      next.set(entity, `g${hash(`${own}|${out}|${inc}`)}`);
    }
    color = next;
  }

  const groups = new Map<string, Entity[]>();
  for (const entity of entities) {
    const key = color.get(entity)!;
    let members = groups.get(key);
    if (!members) groups.set(key, (members = []));
    members.push(entity);
  }

  // Node ids must survive changes elsewhere in the graph, or lingering shows stale ghosts
  // and React remounts circles. A lone entity is its own identity: its traits may change
  // under it (a blinking tag, a temporary state) without it becoming a different node. A
  // group is defined by what its members share, so it is keyed by archetype; only when one
  // archetype splits into several groups does the refined signature tell them apart.
  const groupsPerArchetype = new Map<string, number>();
  for (const [key, members] of groups) {
    if (key.startsWith('pin:') || members.length === 1) continue;
    const arch = getArchetype(world, members[0]).key;
    groupsPerArchetype.set(arch, (groupsPerArchetype.get(arch) ?? 0) + 1);
  }

  const nodeIdOf = new Map<Entity, string>();
  const nodes: EntityGroup[] = [];
  for (const [key, members] of groups) {
    members.sort((a, b) => a - b);
    const isPinned = key.startsWith('pin:');
    const archetype = getArchetype(world, members[0]);
    const id =
      members.length === 1
        ? `ent:${members[0]}`
        : (groupsPerArchetype.get(archetype.key) ?? 1) > 1
          ? `grp:${archetype.key}:${key}`
          : `grp:${archetype.key}`;
    for (const entity of members) nodeIdOf.set(entity, id);
    nodes.push({
      id,
      archetype,
      entities: members,
      entity: members.length === 1 ? members[0] : null,
      pinned: isPinned,
    });
  }

  const edges = new Map<string, EntityGraphEdge>();
  for (const { source, relation, target } of pairs) {
    const sourceId = nodeIdOf.get(source)!;
    const targetId = nodeIdOf.get(target)!;
    const id = `${sourceId}|${getTraitId(relation.trait)}|${targetId}`;
    const edge = edges.get(id);
    if (edge) edge.count++;
    else edges.set(id, { id, source: sourceId, target: targetId, relation, count: 1 });
  }

  return {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    entityCount: entities.size,
    pairCount: pairs.length,
  };
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
