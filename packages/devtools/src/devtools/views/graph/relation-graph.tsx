import type { Entity, Trait } from '@koota/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEntityInfo } from '../../model/entity-info';
import { getTraitId, getTraitName } from '../../model/trait-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Button, IconButton } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { FilterIcon, FitIcon } from '../../ui/icons';
import { Segmented } from '../../ui/segmented';
import { Select } from '../../ui/select';
import { Toolbar } from '../../ui/toolbar';
import { GraphCanvas, type CanvasEdge, type CanvasNode } from './graph-canvas';
import {
  buildEntityGraph,
  resolveRelations,
  type EntityGraph,
  type RelationRecord,
} from './graph-data';
import { GraphEntitiesSheet } from './graph-entities-sheet';
import styles from './relation-graph.module.css';
import { RelationTree } from './relation-tree';
import { useGraphVersion } from './use-graph-version';

interface RelationGraphProps {
  relationTraits: Trait[];
  onSelectEntity: (entity: Entity) => void;
}

type Mode = 'graph' | 'tree';

const MODES = [
  { value: 'graph', label: 'Graph', title: 'Entities and how they relate' },
  { value: 'tree', label: 'Tree', title: 'Hierarchy of one relation' },
] satisfies { value: Mode; label: string; title: string }[];

/** Exclusive relations form strict trees, so one of those is the natural default. */
function defaultTreeRelation(relations: RelationRecord[]): RelationRecord | null {
  return relations.find((r) => r.exclusive) ?? relations[0] ?? null;
}

interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const NO_FILTER = new Set<string>();

function toCanvas(graph: EntityGraph, labelFor: (entity: Entity) => string): Canvas {
  return {
    nodes: graph.nodes.map((node): CanvasNode => {
      const { archetype, entities } = node;
      if (node.entity !== null) {
        const label = labelFor(node.entity);
        return {
          id: node.id,
          variant: 'single',
          label: label.startsWith('World') ? 'W' : label.replace('Entity ', ''),
          title: label,
          detail: archetype.fullLabel,
          entity: node.entity,
          pinned: node.pinned,
        };
      }
      return {
        id: node.id,
        variant: 'group',
        label: String(entities.length),
        count: entities.length,
        title: archetype.label,
        detail: archetype.fullLabel,
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relation.name,
      count: edge.count,
    })),
  };
}

/**
 * Entities that relate, drawn as nodes. Entities that cannot be told apart merge into one
 * group node whose size grows with its count; picking one out of a group pins it as its own
 * node. Tree lays one relation out as an outliner, which suits parent-child relations.
 */
export function RelationGraph({ relationTraits, onSelectEntity }: RelationGraphProps) {
  const world = useWorld();
  const version = useGraphVersion(world);
  const hover = useEntityHover();
  const hoveredRef = useRef<Entity | null>(null);

  const [mode, setMode] = useState<Mode>('graph');
  const [selectedRelations, setSelectedRelations] = useState<Set<string>>(() => new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  // Entities the user singled out; they never merge back into a group until regrouped.
  const [pinned, setPinned] = useState<Set<Entity>>(() => new Set());

  // The relation the tree shows, by trait id; falls back when unset or gone.
  const [treeRelationId, setTreeRelationId] = useState<string | null>(null);

  // The sheet lists the members of a group node, resolved live by id.
  const [sheetNodeId, setSheetNodeId] = useState<string | null>(null);

  const labelFor = useCallback((entity: Entity) => getEntityInfo(world, entity).label, [world]);

  const relationNames = useMemo(
    () => Array.from(new Set(relationTraits.map(getTraitName))).sort(),
    [relationTraits]
  );

  const relations = useMemo(
    () => resolveRelations(relationTraits, selectedRelations),
    [relationTraits, selectedRelations]
  );

  const allRelations = useMemo(() => resolveRelations(relationTraits, NO_FILTER), [relationTraits]);

  const treeRelation =
    allRelations.find((r) => String(getTraitId(r.trait)) === treeRelationId) ??
    defaultTreeRelation(allRelations);

  // Forget pins on entities that no longer exist.
  useEffect(() => {
    if (![...pinned].some((entity) => !world.has(entity))) return;
    setPinned((prev) => new Set([...prev].filter((entity) => world.has(entity))));
  }, [pinned, world, version]);

  const graph = useMemo(
    () => (mode === 'graph' ? buildEntityGraph(world, relations, pinned) : null),
    // version is the change signal for the world
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, relations, pinned, mode, version]
  );

  const canvas = useMemo(
    () => (graph ? toCanvas(graph, labelFor) : { nodes: [], edges: [] }),
    [graph, labelFor]
  );

  const pin = useCallback((entity: Entity) => {
    setPinned((prev) => new Set(prev).add(entity));
    setSheetNodeId(null);
  }, []);

  const sheet = useMemo(() => {
    if (sheetNodeId === null || !graph) return null;
    const node = graph.nodes.find((n) => n.id === sheetNodeId);
    if (!node) return null;
    return {
      title: node.archetype.fullLabel,
      entities: node.entities,
      // A lone entity has nothing to pin out of; picking it opens the inspector instead.
      onSelect: node.entity !== null ? onSelectEntity : pin,
    };
  }, [sheetNodeId, graph, onSelectEntity, pin]);

  const regroup = useCallback(() => setPinned(new Set()), []);

  const handleNodeClick = useCallback((node: CanvasNode) => setSheetNodeId(node.id), []);

  const handleNodeHover = useCallback(
    (node: CanvasNode | null) => {
      const prev = hoveredRef.current;
      if (prev !== null) hover.unhover(prev);
      const next = node?.entity ?? null;
      if (next !== null) hover.hover(next);
      hoveredRef.current = next;
    },
    [hover]
  );

  const toggleRelation = (name: string) => {
    setSelectedRelations((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const showCanvas = mode === 'graph';

  return (
    <div className={styles.container}>
      <Toolbar
        actions={
          showCanvas ? (
            <>
              {pinned.size > 0 && (
                <Button onClick={regroup} title="Merge pinned entities back into their groups">
                  Regroup
                </Button>
              )}
              <IconButton onClick={() => setFitSignal((n) => n + 1)} title="Fit to view">
                <FitIcon />
              </IconButton>
              {relationNames.length > 1 && (
                <IconButton
                  active={showFilter}
                  count={selectedRelations.size}
                  onClick={() => setShowFilter(!showFilter)}
                  title="Filter relations"
                >
                  <FilterIcon />
                </IconButton>
              )}
            </>
          ) : (
            treeRelation && (
              <Select
                value={String(getTraitId(treeRelation.trait))}
                onChange={setTreeRelationId}
                title={treeRelation.exclusive ? 'Exclusive relation' : 'Non-exclusive relation'}
                options={allRelations.map((r) => ({
                  value: String(getTraitId(r.trait)),
                  label: r.exclusive ? r.name : `${r.name} (multi)`,
                }))}
              />
            )
          )
        }
        drawer={
          showCanvas &&
          showFilter &&
          relationNames.length > 1 &&
          relationNames.map((name) => (
            <Button
              key={name}
              active={selectedRelations.has(name)}
              onClick={() => toggleRelation(name)}
              title={`Toggle ${name}`}
            >
              {name}
            </Button>
          ))
        }
      >
        <Segmented options={MODES} value={mode} onChange={setMode} />
      </Toolbar>

      {showCanvas ? (
        <GraphCanvas
          nodes={canvas.nodes}
          edges={canvas.edges}
          fitSignal={fitSignal}
          epoch="graph"
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
        >
          <Empty
            hint={
              relationTraits.length === 0
                ? 'Create a relation to visualize it'
                : 'Add a relation to an entity to see it here'
            }
          >
            {relationTraits.length === 0 ? 'No relations defined' : 'No relations in use'}
          </Empty>
        </GraphCanvas>
      ) : treeRelation ? (
        <RelationTree
          key={getTraitId(treeRelation.trait)}
          relation={treeRelation}
          version={version}
          onSelectEntity={onSelectEntity}
        />
      ) : (
        <Empty>No relations to show</Empty>
      )}

      {sheet && (
        <GraphEntitiesSheet
          title={sheet.title}
          entities={sheet.entities}
          onSelect={sheet.onSelect}
          onClose={() => setSheetNodeId(null)}
        />
      )}
    </div>
  );
}
