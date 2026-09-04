import type { Entity, Trait } from '@koota/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEntityInfo } from '../../model/entity-info';
import { getTraitName } from '../../model/trait-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Button, IconButton } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { FilterIcon, FitIcon } from '../../ui/icons';
import { GraphCanvas, type CanvasEdge, type CanvasNode } from './graph-canvas';
import {
  buildFocusGraph,
  buildSchemaGraph,
  resolveRelations,
  type FocusGraph,
  type SchemaGraph,
} from './graph-data';
import { GraphEntitiesSheet } from './graph-entities-sheet';
import styles from './relation-graph.module.css';
import { RelationTree } from './relation-tree';
import { useGraphVersion } from './use-graph-version';

interface RelationGraphProps {
  relationTraits: Trait[];
  onSelectEntity: (entity: Entity) => void;
}

type Mode = 'schema' | 'tree';

interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const EMPTY_CANVAS: Canvas = { nodes: [], edges: [] };
const NO_FILTER = new Set<string>();

function schemaToCanvas(graph: SchemaGraph): Canvas {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      variant: 'group',
      label: node.archetype.label,
      count: node.entities.length,
      title: `${node.archetype.fullLabel}\n${node.entities.length} entities`,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relation.name,
      count: edge.count,
    })),
  };
}

function focusToCanvas(graph: FocusGraph, labelFor: (entity: Entity) => string): Canvas {
  return {
    nodes: graph.nodes.map((node): CanvasNode => {
      if (node.kind === 'aggregate') {
        return {
          id: node.id,
          variant: 'aggregate',
          label: node.archetype.label,
          count: node.entities.length,
          title: `${node.archetype.fullLabel}\n${node.entities.length} entities`,
        };
      }
      const label = labelFor(node.entity);
      return {
        id: node.id,
        variant: node.kind,
        label: label.startsWith('World') ? 'W' : label.replace('Entity ', ''),
        title: label,
        entity: node.entity,
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
 * Three ways to read the same relations. Schema groups entities by archetype, the way an ER
 * diagram groups rows by table. Clicking into a group focuses one entity and shows only its
 * neighbors. Tree lays one relation out as an outliner, which suits parent-child relations.
 */
export function RelationGraph({ relationTraits, onSelectEntity }: RelationGraphProps) {
  const world = useWorld();
  const version = useGraphVersion(world);
  const hover = useEntityHover();
  const hoveredRef = useRef<Entity | null>(null);

  const [mode, setMode] = useState<Mode>('schema');
  const [selectedRelations, setSelectedRelations] = useState<Set<string>>(() => new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  // The focus stack drives the neighborhood view; empty means the schema overview.
  const [focusStack, setFocusStack] = useState<Entity[]>([]);
  const focus = focusStack.length > 0 ? focusStack[focusStack.length - 1] : null;

  // The sheet shows the members of a group or aggregate node, resolved live by id.
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

  // Drop focus on entities that no longer exist.
  useEffect(() => {
    if (focus !== null && !world.has(focus)) {
      setFocusStack((prev) => prev.filter((e) => world.has(e)));
    }
  }, [focus, world, version]);

  const schema = useMemo(
    () => (mode === 'schema' && focus === null ? buildSchemaGraph(world, relations) : null),
    // version is the change signal for the world
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, relations, mode, focus, version]
  );

  const focusGraph = useMemo(
    () =>
      mode === 'schema' && focus !== null && world.has(focus)
        ? buildFocusGraph(world, relations, focus)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, relations, mode, focus, version]
  );

  const canvas = useMemo(() => {
    if (focusGraph) return focusToCanvas(focusGraph, labelFor);
    if (schema) return schemaToCanvas(schema);
    return EMPTY_CANVAS;
  }, [focusGraph, schema, labelFor]);

  // Resolve the sheet's node against the live graph so it tracks changes and closes if gone.
  const sheet = useMemo(() => {
    if (sheetNodeId === null) return null;
    if (schema) {
      const node = schema.nodes.find((n) => n.id === sheetNodeId);
      return node ? { title: node.archetype.fullLabel, entities: node.entities } : null;
    }
    if (focusGraph) {
      const node = focusGraph.nodes.find((n) => n.id === sheetNodeId);
      if (!node || node.kind !== 'aggregate') return null;
      const focusName = labelFor(focusGraph.focus);
      const title =
        node.direction === 'in'
          ? `${node.archetype.label} —${node.relation.name}→ ${focusName}`
          : `${focusName} —${node.relation.name}→ ${node.archetype.label}`;
      return { title, entities: node.entities };
    }
    return null;
  }, [sheetNodeId, schema, focusGraph, labelFor]);

  const pushFocus = useCallback((entity: Entity) => {
    setFocusStack((prev) => (prev[prev.length - 1] === entity ? prev : [...prev, entity]));
    setSheetNodeId(null);
    setFitSignal((n) => n + 1);
  }, []);

  const popFocus = useCallback(() => {
    setFocusStack((prev) => prev.slice(0, -1));
    setSheetNodeId(null);
    setFitSignal((n) => n + 1);
  }, []);

  const handleNodeClick = useCallback(
    (node: CanvasNode) => {
      switch (node.variant) {
        case 'group':
        case 'aggregate':
          setSheetNodeId(node.id);
          break;
        case 'entity':
          if (node.entity !== undefined) pushFocus(node.entity);
          break;
        case 'focus':
          if (node.entity !== undefined) onSelectEntity(node.entity);
          break;
      }
    },
    [pushFocus, onSelectEntity]
  );

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

  const stats = (() => {
    if (focusGraph) {
      const sum = (pick: (id: string) => boolean) =>
        focusGraph.edges.filter((e) => pick(e.target)).reduce((s, e) => s + e.count, 0);
      const incoming = sum((target) => target === focusGraph.focusId);
      const outgoing = sum((target) => target !== focusGraph.focusId);
      return `${incoming} in · ${outgoing} out`;
    }
    if (schema) {
      const types = schema.nodes.length;
      const pairs = schema.pairCount;
      return `${types} type${types === 1 ? '' : 's'} · ${pairs} link${pairs === 1 ? '' : 's'}`;
    }
    return '';
  })();

  const showCanvas = mode === 'schema';

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <div className={styles.controlsRow}>
          {focusGraph ? (
            <div className={styles.breadcrumb}>
              <IconButton onClick={popFocus} title="Back">
                ←
              </IconButton>
              <span className={styles.breadcrumbTitle}>{labelFor(focusGraph.focus)}</span>
              <Button onClick={() => onSelectEntity(focusGraph.focus)} title="Open in inspector">
                Inspect
              </Button>
            </div>
          ) : (
            <div className={styles.stats}>{stats}</div>
          )}

          <div className={styles.toolbar}>
            {!focusGraph && (
              <div className={styles.segmented} role="tablist">
                <Button
                  active={mode === 'schema'}
                  onClick={() => setMode('schema')}
                  title="Types and how they relate"
                >
                  Schema
                </Button>
                <Button
                  active={mode === 'tree'}
                  onClick={() => setMode('tree')}
                  title="Hierarchy of one relation"
                >
                  Tree
                </Button>
              </div>
            )}
            {showCanvas && (
              <IconButton onClick={() => setFitSignal((n) => n + 1)} title="Fit to view">
                <FitIcon />
              </IconButton>
            )}
            {showCanvas && relationNames.length > 1 && (
              <IconButton
                active={showFilter}
                count={selectedRelations.size}
                onClick={() => setShowFilter(!showFilter)}
                title="Filter relations"
              >
                <FilterIcon />
              </IconButton>
            )}
          </div>
        </div>

        {showCanvas && showFilter && relationNames.length > 1 && (
          <div className={styles.filters}>
            {relationNames.map((name) => (
              <Button
                key={name}
                active={selectedRelations.has(name)}
                onClick={() => toggleRelation(name)}
                title={`Toggle ${name}`}
              >
                {name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {showCanvas ? (
        <GraphCanvas
          nodes={canvas.nodes}
          edges={canvas.edges}
          fitSignal={fitSignal}
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
      ) : (
        <RelationTree relations={allRelations} version={version} onSelectEntity={onSelectEntity} />
      )}

      {sheet && (
        <GraphEntitiesSheet
          title={sheet.title}
          entities={sheet.entities}
          onSelect={pushFocus}
          onClose={() => setSheetNodeId(null)}
        />
      )}
    </div>
  );
}
