import type { Entity, Trait } from '@koota/core';
import { unpackEntity } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getTraitName } from '../../model/trait-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Button, IconButton } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { FilterIcon, FitIcon } from '../../ui/icons';
import {
  computeGraphLayout,
  EMPTY_GRAPH,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  type AggregateNode,
  type GraphData,
} from './graph-layout';
import styles from './relation-graph.module.css';
import { RelationSourcesSheet } from './relation-sources-sheet';
import { useGraphViewport } from './use-graph-viewport';

const RELAYOUT_DEBOUNCE = 50;

interface RelationGraphProps {
  relationTraits: Trait[];
  onSelectEntity: (entity: Entity) => void;
}

/** The graph is recomputed whenever any relation changes, debounced so bursts of changes lay out once. */
function useGraphData(relationTraits: Trait[], selectedRelations: Set<string>): GraphData {
  const world = useWorld();
  const [data, setData] = useState<GraphData>(EMPTY_GRAPH);

  useEffect(() => {
    if (relationTraits.length === 0) {
      setData(EMPTY_GRAPH);
      return;
    }

    const update = () => setData(computeGraphLayout(world, relationTraits, selectedRelations));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timeout);
      timeout = setTimeout(update, RELAYOUT_DEBOUNCE);
    };

    update();
    const unsubscribes = relationTraits.flatMap((trait) => [
      world.onAdd(trait, schedule),
      world.onRemove(trait, schedule),
      world.onChange(trait, schedule),
    ]);

    return () => {
      clearTimeout(timeout);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [world, relationTraits, selectedRelations]);

  return data;
}

export function RelationGraph({ relationTraits, onSelectEntity }: RelationGraphProps) {
  const hover = useEntityHover();
  const svgRef = useRef<SVGSVGElement>(null);
  const viewport = useGraphViewport(svgRef);

  const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [openAggregate, setOpenAggregate] = useState<AggregateNode | null>(null);

  const data = useGraphData(relationTraits, selectedRelations);

  const relationNames = useMemo(
    () => Array.from(new Set(relationTraits.map(getTraitName))).sort(),
    [relationTraits]
  );

  const toggleRelation = (name: string) => {
    setSelectedRelations((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Hovering a node keeps it and its neighbors bright and dims the rest
  const connectedIds = useMemo(() => {
    const connected = new Set<string>();
    if (!hoveredNodeId) return connected;
    connected.add(hoveredNodeId);
    for (const edge of data.edges) {
      if (edge.source === hoveredNodeId) connected.add(edge.target);
      if (edge.target === hoveredNodeId) connected.add(edge.source);
    }
    return connected;
  }, [hoveredNodeId, data]);

  const isDimmed = (...ids: string[]) =>
    hoveredNodeId !== null && ids.some((id) => !connectedIds.has(id));

  const targetCount = data.nodes.filter((node) => node.type === 'entity').length;
  const relationCount = data.nodes.reduce(
    (sum, node) => (node.type === 'aggregate' ? sum + node.entities.length : sum),
    0
  );

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.stats}>
          {targetCount} targets · {relationCount} relations
        </span>
        <div className={styles.toolbar}>
          <IconButton title="Fit to view" onClick={viewport.reset}>
            <FitIcon />
          </IconButton>
          {relationNames.length > 0 && (
            <IconButton
              active={showFilters}
              count={selectedRelations.size}
              title="Filter relations"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <FilterIcon />
            </IconButton>
          )}
        </div>
        {showFilters && relationNames.length > 0 && (
          <div className={styles.filters}>
            {relationNames.map((name) => (
              <Button
                key={name}
                active={selectedRelations.has(name)}
                title={`Toggle ${name}`}
                onClick={() => toggleRelation(name)}
              >
                {name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.viewport}>
        {data.nodes.length === 0 ? (
          <div className={styles.empty}>
            <Empty hint="Create some relations to visualize them">No relations found</Empty>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={GRAPH_WIDTH}
            height={GRAPH_HEIGHT}
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            className={`${styles.svg} ${viewport.isDragging ? styles.dragging : ''}`}
            {...viewport.handlers}
          >
            <defs>
              <marker
                id="koota-devtools-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(200, 200, 200, 0.7)" />
              </marker>
            </defs>

            <g transform={viewport.transform}>
              {data.edges.map((edge) => (
                <g key={edge.id} className={isDimmed(edge.source, edge.target) ? styles.dimmed : ''}>
                  <line
                    x1={edge.sourceX}
                    y1={edge.sourceY}
                    x2={edge.targetX}
                    y2={edge.targetY}
                    className={styles.edge}
                    markerEnd="url(#koota-devtools-arrow)"
                  />
                  {edge.relationName && (
                    <text
                      x={(edge.sourceX + edge.targetX) / 2}
                      y={(edge.sourceY + edge.targetY) / 2 - 4}
                      className={styles.edgeLabel}
                      textAnchor="middle"
                    >
                      {edge.relationName}
                    </text>
                  )}
                </g>
              ))}

              {data.nodes.map((node) =>
                node.type === 'aggregate' ? (
                  <g
                    key={node.id}
                    className={`${styles.node} ${isDimmed(node.id) ? styles.dimmed : ''}`}
                    onClick={() => setOpenAggregate(node)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    <rect
                      x={node.x - node.width / 2}
                      y={node.y - node.height / 2}
                      width={node.width}
                      height={node.height}
                      rx={4}
                      className={styles.aggregate}
                    />
                    <text
                      x={node.x}
                      y={node.y}
                      className={styles.aggregateLabel}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {node.relationName} {node.entities.length}
                    </text>
                  </g>
                ) : (
                  <g
                    key={node.id}
                    className={`${styles.node} ${isDimmed(node.id) ? styles.dimmed : ''}`}
                    onClick={() => onSelectEntity(node.entity)}
                    onMouseEnter={() => {
                      hover.hover(node.entity);
                      setHoveredNodeId(node.id);
                    }}
                    onMouseLeave={() => {
                      hover.unhover(node.entity);
                      setHoveredNodeId(null);
                    }}
                  >
                    <circle cx={node.x} cy={node.y} r={node.radius} className={styles.entity} />
                    <text
                      x={node.x}
                      y={node.y}
                      className={styles.entityLabel}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {node.label}
                    </text>
                  </g>
                )
              )}
            </g>
          </svg>
        )}
      </div>

      {openAggregate && (
        <RelationSourcesSheet
          title={`${openAggregate.relationName} → ${unpackEntity(openAggregate.target).entityId}`}
          relation={openAggregate.relation}
          target={openAggregate.target}
          onSelect={(entity) => {
            setOpenAggregate(null);
            onSelectEntity(entity);
          }}
          onClose={() => setOpenAggregate(null)}
        />
      )}
    </div>
  );
}
