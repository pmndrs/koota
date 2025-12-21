import type { Entity, Relation, Trait, World } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import dagre from '@dagrejs/dagre';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { IsDevtoolsHovered } from '../../traits';
import { useWorld } from '../hooks/use-world';
import { getTraitName } from './trait-utils';
import { EntityListSheet } from './entity-list-sheet';
import styles from './relation-graph.module.css';

interface RelationGraphProps {
	relationTraits: TraitWithDebug[];
	onSelectEntity: (entity: Entity) => void;
}

// Aggregate node: represents multiple entities with the same relation to a target
interface AggregateNode {
	type: 'aggregate';
	id: string;
	relationName: string;
	relation: Relation<Trait>;
	target: Entity;
	entities: Entity[];
	count: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

// Entity node: represents a single target entity
interface EntityNode {
	type: 'entity';
	id: string;
	entity: Entity;
	label: string;
	x: number;
	y: number;
	radius: number;
}

type GraphNode = AggregateNode | EntityNode;

interface GraphEdge {
	id: string;
	source: string;
	target: string;
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
}

interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	width: number;
	height: number;
}

const GRAPH_WIDTH = 260;
const GRAPH_HEIGHT = 250;
const ENTITY_RADIUS = 14;
const AGGREGATE_WIDTH = 70;
const AGGREGATE_HEIGHT = 24;
const PADDING = 20;
const MIN_SCALE = 0.4;

function computeAggregatedLayout(
	world: World,
	relationTraits: TraitWithDebug[],
	selectedRelations: Set<string>
): GraphData {
	const g = new dagre.graphlib.Graph();
	g.setGraph({ rankdir: 'LR', nodesep: 25, ranksep: 50, marginx: PADDING, marginy: PADDING });
	g.setDefaultEdgeLabel(() => ({}));

	// Group by (relationName, targetEntity) → list of source entities
	const aggregates = new Map<string, {
		relationName: string;
		relation: Relation<Trait>;
		target: Entity;
		entities: Entity[];
	}>();

	// Track all target entities
	const targetEntities = new Map<string, Entity>();

	// Filter traits based on selection
	const filteredTraits =
		selectedRelations.size === 0
			? relationTraits
			: relationTraits.filter((trait) => {
					const relationName = getTraitName(trait);
					return selectedRelations.has(relationName);
			  });

	// Collect aggregates
	for (const trait of filteredTraits) {
		const traitCtx = trait[$internal];
		const relation = traitCtx.relation as Relation<Trait> | null;
		if (!relation) continue;

		const relationName = getTraitName(trait);
		const queryResult = world.query(trait);

		for (const entity of queryResult) {
			const targets = entity.targetsFor(relation);
			for (const target of targets) {
				const targetKey = String(target);
				targetEntities.set(targetKey, target);

				const aggregateKey = `${relationName}-${targetKey}`;
				let agg = aggregates.get(aggregateKey);
				if (!agg) {
					agg = { relationName, relation, target, entities: [] };
					aggregates.set(aggregateKey, agg);
				}
				agg.entities.push(entity);
			}
		}
	}

	// If no aggregates, return empty
	if (aggregates.size === 0) {
		return { nodes: [], edges: [], width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
	}

	// Add aggregate nodes to dagre
	for (const [key, agg] of aggregates) {
		g.setNode(`agg-${key}`, { width: AGGREGATE_WIDTH, height: AGGREGATE_HEIGHT });
	}

	// Add target entity nodes to dagre
	for (const [key] of targetEntities) {
		g.setNode(`ent-${key}`, { width: ENTITY_RADIUS * 2, height: ENTITY_RADIUS * 2 });
	}

	// Add edges from aggregates to targets
	for (const [key, agg] of aggregates) {
		g.setEdge(`agg-${key}`, `ent-${String(agg.target)}`);
	}

	// Run layout
	dagre.layout(g);

	// Get graph dimensions
	const graphInfo = g.graph();
	const graphWidth = graphInfo.width ?? GRAPH_WIDTH;
	const graphHeight = graphInfo.height ?? GRAPH_HEIGHT;

	// Calculate scale to fit viewport
	const scaleX = (GRAPH_WIDTH - PADDING * 2) / graphWidth;
	const scaleY = (GRAPH_HEIGHT - PADDING * 2) / graphHeight;
	const scale = Math.max(Math.min(scaleX, scaleY, 1), MIN_SCALE);

	// Calculate offset to center
	const offsetX = (GRAPH_WIDTH - graphWidth * scale) / 2;
	const offsetY = (GRAPH_HEIGHT - graphHeight * scale) / 2;

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	// Extract aggregate nodes
	for (const [key, agg] of aggregates) {
		const nodeId = `agg-${key}`;
		const node = g.node(nodeId);
		nodes.push({
			type: 'aggregate',
			id: nodeId,
			relationName: agg.relationName,
			relation: agg.relation,
			target: agg.target,
			entities: agg.entities,
			count: agg.entities.length,
			x: node.x * scale + offsetX,
			y: node.y * scale + offsetY,
			width: AGGREGATE_WIDTH * scale,
			height: AGGREGATE_HEIGHT * scale,
		});
	}

	// Extract entity nodes
	for (const [key, entity] of targetEntities) {
		const nodeId = `ent-${key}`;
		const node = g.node(nodeId);
		const { entityId } = unpackEntity(entity);
		nodes.push({
			type: 'entity',
			id: nodeId,
			entity,
			label: `${entityId}`,
			x: node.x * scale + offsetX,
			y: node.y * scale + offsetY,
			radius: ENTITY_RADIUS * scale,
		});
	}

	// Extract edges
	for (const [key, agg] of aggregates) {
		const sourceId = `agg-${key}`;
		const targetId = `ent-${String(agg.target)}`;
		const sourceNode = g.node(sourceId);
		const targetNode = g.node(targetId);

		const sx = sourceNode.x * scale + offsetX;
		const sy = sourceNode.y * scale + offsetY;
		const tx = targetNode.x * scale + offsetX;
		const ty = targetNode.y * scale + offsetY;

		// Calculate edge endpoints
		const angle = Math.atan2(ty - sy, tx - sx);
		const scaledRadius = ENTITY_RADIUS * scale;
		const scaledWidth = AGGREGATE_WIDTH * scale;

		edges.push({
			id: `edge-${key}`,
			source: sourceId,
			target: targetId,
			sourceX: sx + (scaledWidth / 2) * Math.cos(angle),
			sourceY: sy + (AGGREGATE_HEIGHT * scale / 2) * Math.sin(angle),
			targetX: tx - Math.cos(angle) * (scaledRadius + 6),
			targetY: ty - Math.sin(angle) * (scaledRadius + 6),
		});
	}

	return { nodes, edges, width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
}

export function RelationGraph({ relationTraits, onSelectEntity }: RelationGraphProps) {
	const world = useWorld();
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
	const [showFilter, setShowFilter] = useState(false);
	const [selectedAggregate, setSelectedAggregate] = useState<AggregateNode | null>(null);
	const hoveredEntityRef = useRef<Entity | null>(null);

	const updateGraph = useCallback(() => {
		const data = computeAggregatedLayout(world, relationTraits, selectedRelations);
		setGraphData(data);
	}, [world, relationTraits, selectedRelations]);

	// Get unique relation names for filter
	const relationNames = useMemo(() => {
		return Array.from(new Set(relationTraits.map((trait) => getTraitName(trait)))).sort();
	}, [relationTraits]);

	const toggleRelation = useCallback((relationName: string) => {
		setSelectedRelations((prev) => {
			const next = new Set(prev);
			if (next.has(relationName)) {
				next.delete(relationName);
			} else {
				next.add(relationName);
			}
			return next;
		});
	}, []);

	// Handle node hover
	const handleEntityHover = useCallback(
		(entity: Entity | null) => {
			if (hoveredEntityRef.current !== null && world.has(hoveredEntityRef.current)) {
				hoveredEntityRef.current.remove(IsDevtoolsHovered);
			}
			if (entity && world.has(entity)) {
				entity.add(IsDevtoolsHovered);
				hoveredEntityRef.current = entity;
			} else {
				hoveredEntityRef.current = null;
			}
		},
		[world]
	);

	// Generate graph data when component mounts or when relations change
	useEffect(() => {
		if (relationTraits.length === 0) {
			setGraphData({ nodes: [], edges: [], width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
			return;
		}

		updateGraph();

		const unsubs: (() => void)[] = [];
		let timeout: ReturnType<typeof setTimeout>;

		const scheduleUpdate = () => {
			clearTimeout(timeout);
			timeout = setTimeout(updateGraph, 50);
		};

		for (const trait of relationTraits) {
			unsubs.push(world.onAdd(trait, scheduleUpdate));
			unsubs.push(world.onRemove(trait, scheduleUpdate));
			unsubs.push(world.onChange(trait, scheduleUpdate));
		}

		return () => {
			clearTimeout(timeout);
			unsubs.forEach((unsub) => unsub());
		};
	}, [world, relationTraits, updateGraph]);

	// Clean up hover on unmount
	useEffect(() => {
		return () => {
			if (hoveredEntityRef.current !== null && world.has(hoveredEntityRef.current)) {
				hoveredEntityRef.current.remove(IsDevtoolsHovered);
			}
		};
	}, [world]);

	const aggregateCount = graphData?.nodes.filter((n) => n.type === 'aggregate').length ?? 0;
	const entityCount = graphData?.nodes.filter((n) => n.type === 'entity').length ?? 0;
	const totalRelations = graphData?.nodes
		.filter((n): n is AggregateNode => n.type === 'aggregate')
		.reduce((sum, n) => sum + n.count, 0) ?? 0;

	return (
		<div className={`${styles.container} relation-graph`}>
			<div className={styles.controls}>
				<div className={styles.controlsContent}>
					<div className={styles.stats}>
						{entityCount} targets · {totalRelations} relations
					</div>
					{relationNames.length > 0 && (
						<button
							className={`${styles.filterToggle} ${
								showFilter ? styles.filterToggleActive : ''
							}`}
							onClick={() => setShowFilter(!showFilter)}
							title="Filter relations"
						>
							<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
								<path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
							</svg>
							{selectedRelations.size > 0 && (
								<span className={styles.filterBadge}>{selectedRelations.size}</span>
							)}
						</button>
					)}
				</div>
				{showFilter && relationNames.length > 0 && (
					<div className={styles.filterMenu}>
						{relationNames.map((name) => (
							<button
								key={name}
								className={`${styles.filterButton} ${
									selectedRelations.has(name) ? styles.filterButtonActive : ''
								}`}
								onClick={() => toggleRelation(name)}
								title={`Toggle ${name}`}
							>
								{name}
							</button>
						))}
					</div>
				)}
			</div>
			<div className={styles.graphWrapper}>
				{!graphData || graphData.nodes.length === 0 ? (
					<div className={styles.empty}>
						<div className={styles.emptyMessage}>No relations found</div>
						<div className={styles.emptySubtext}>
							Create some relations to visualize them
						</div>
					</div>
				) : (
					<svg
						width={GRAPH_WIDTH}
						height={GRAPH_HEIGHT}
						className={styles.svg}
						viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
					>
						<defs>
							<marker
								id="arrow"
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

						{/* Edges */}
						<g className={styles.edges}>
							{graphData.edges.map((edge) => (
								<line
									key={edge.id}
									x1={edge.sourceX}
									y1={edge.sourceY}
									x2={edge.targetX}
									y2={edge.targetY}
									className={styles.edge}
									markerEnd="url(#arrow)"
								/>
							))}
						</g>

						{/* Nodes */}
						<g className={styles.nodes}>
							{graphData.nodes.map((node) => {
								if (node.type === 'aggregate') {
									return (
										<g
											key={node.id}
											className={styles.aggregateNode}
											onClick={() => setSelectedAggregate(node)}
											style={{ cursor: 'pointer' }}
										>
											<rect
												x={node.x - node.width / 2}
												y={node.y - node.height / 2}
												width={node.width}
												height={node.height}
												rx={4}
												className={styles.aggregateRect}
											/>
											<text
												x={node.x}
												y={node.y}
												className={styles.aggregateLabel}
												textAnchor="middle"
												dominantBaseline="central"
											>
												{node.relationName} {node.count}
											</text>
										</g>
									);
								} else {
									return (
										<g
											key={node.id}
											className={styles.entityNode}
											onClick={() => onSelectEntity(node.entity)}
											onMouseEnter={() => handleEntityHover(node.entity)}
											onMouseLeave={() => handleEntityHover(null)}
											style={{ cursor: 'pointer' }}
										>
											<circle
												cx={node.x}
												cy={node.y}
												r={node.radius}
												className={styles.entityCircle}
											/>
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
									);
								}
							})}
						</g>
					</svg>
				)}
			</div>

			{/* Entity list sheet for aggregate drill-down */}
			{selectedAggregate && (
				<EntityListSheet
					title={`${selectedAggregate.relationName} → ${unpackEntity(selectedAggregate.target).entityId}`}
					relation={selectedAggregate.relation}
					target={selectedAggregate.target}
					onSelect={(entity) => {
						setSelectedAggregate(null);
						onSelectEntity(entity);
					}}
					onClose={() => setSelectedAggregate(null)}
				/>
			)}
		</div>
	);
}
