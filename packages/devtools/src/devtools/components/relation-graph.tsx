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

// Entity node: represents a single entity
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
	relationName?: string; // For labeling individual edges
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
const AGGREGATION_THRESHOLD = 5; // Show individual nodes up to this count

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

	// Track source entities that will be shown individually
	const sourceEntities = new Map<string, { entity: Entity; relationName: string; target: Entity }>();

	// Add nodes to dagre based on threshold
	for (const [key, agg] of aggregates) {
		if (agg.entities.length <= AGGREGATION_THRESHOLD) {
			// Show individual source entity nodes
			for (const entity of agg.entities) {
				const sourceKey = `src-${entity}-${key}`;
				sourceEntities.set(sourceKey, {
					entity,
					relationName: agg.relationName,
					target: agg.target,
				});
				g.setNode(sourceKey, { width: ENTITY_RADIUS * 2, height: ENTITY_RADIUS * 2 });
				g.setEdge(sourceKey, `ent-${String(agg.target)}`);
			}
		} else {
			// Show aggregate node
			g.setNode(`agg-${key}`, { width: AGGREGATE_WIDTH, height: AGGREGATE_HEIGHT });
			g.setEdge(`agg-${key}`, `ent-${String(agg.target)}`);
		}
	}

	// Add target entity nodes to dagre
	for (const [key] of targetEntities) {
		g.setNode(`ent-${key}`, { width: ENTITY_RADIUS * 2, height: ENTITY_RADIUS * 2 });
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

	// Extract aggregate nodes (only for groups > threshold)
	for (const [key, agg] of aggregates) {
		if (agg.entities.length > AGGREGATION_THRESHOLD) {
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

			// Add edge for aggregate
			const targetId = `ent-${String(agg.target)}`;
			const targetNode = g.node(targetId);
			const sx = node.x * scale + offsetX;
			const sy = node.y * scale + offsetY;
			const tx = targetNode.x * scale + offsetX;
			const ty = targetNode.y * scale + offsetY;
			const angle = Math.atan2(ty - sy, tx - sx);
			const scaledRadius = ENTITY_RADIUS * scale;
			const scaledWidth = AGGREGATE_WIDTH * scale;

			edges.push({
				id: `edge-${key}`,
				source: nodeId,
				target: targetId,
				sourceX: sx + (scaledWidth / 2) * Math.cos(angle),
				sourceY: sy + (AGGREGATE_HEIGHT * scale / 2) * Math.sin(angle),
				targetX: tx - Math.cos(angle) * (scaledRadius + 6),
				targetY: ty - Math.sin(angle) * (scaledRadius + 6),
			});
		}
	}

	// Extract source entity nodes (for groups <= threshold)
	for (const [sourceKey, info] of sourceEntities) {
		const node = g.node(sourceKey);
		const { entityId } = unpackEntity(info.entity);
		nodes.push({
			type: 'entity',
			id: sourceKey,
			entity: info.entity,
			label: `${entityId}`,
			x: node.x * scale + offsetX,
			y: node.y * scale + offsetY,
			radius: ENTITY_RADIUS * scale,
		});

		// Add edge from source to target
		const targetId = `ent-${String(info.target)}`;
		const targetNode = g.node(targetId);
		const sx = node.x * scale + offsetX;
		const sy = node.y * scale + offsetY;
		const tx = targetNode.x * scale + offsetX;
		const ty = targetNode.y * scale + offsetY;
		const angle = Math.atan2(ty - sy, tx - sx);
		const scaledRadius = ENTITY_RADIUS * scale;

		edges.push({
			id: `edge-${sourceKey}`,
			source: sourceKey,
			target: targetId,
			sourceX: sx + Math.cos(angle) * scaledRadius,
			sourceY: sy + Math.sin(angle) * scaledRadius,
			targetX: tx - Math.cos(angle) * (scaledRadius + 6),
			targetY: ty - Math.sin(angle) * (scaledRadius + 6),
			relationName: info.relationName,
		});
	}

	// Extract target entity nodes
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

	return { nodes, edges, width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
}

export function RelationGraph({ relationTraits, onSelectEntity }: RelationGraphProps) {
	const world = useWorld();
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
	const [showFilter, setShowFilter] = useState(false);
	const [selectedAggregate, setSelectedAggregate] = useState<AggregateNode | null>(null);
	const hoveredEntityRef = useRef<Entity | null>(null);

	// Zoom and pan state
	const [scale, setScale] = useState(1);
	const [translate, setTranslate] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
	const svgRef = useRef<SVGSVGElement>(null);

	// Hover highlighting state
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

	// Zoom with mouse wheel (native listener to properly prevent browser zoom)
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const handleWheelNative = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const rect = svg.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
			const newScale = Math.min(Math.max(scale * zoomFactor, 0.1), 4);

			const scaleChange = newScale / scale;
			const newTranslateX = mouseX - (mouseX - translate.x) * scaleChange;
			const newTranslateY = mouseY - (mouseY - translate.y) * scaleChange;

			setScale(newScale);
			setTranslate({ x: newTranslateX, y: newTranslateY });
		};

		svg.addEventListener('wheel', handleWheelNative, { passive: false });
		return () => svg.removeEventListener('wheel', handleWheelNative);
	}, [scale, translate]);

	// Pan with mouse drag
	const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
		if (e.button !== 0) return; // Only left click
		setIsDragging(true);
		dragStartRef.current = {
			x: e.clientX,
			y: e.clientY,
			translateX: translate.x,
			translateY: translate.y,
		};
	}, [translate]);

	const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
		if (!isDragging) return;
		const dx = e.clientX - dragStartRef.current.x;
		const dy = e.clientY - dragStartRef.current.y;
		setTranslate({
			x: dragStartRef.current.translateX + dx,
			y: dragStartRef.current.translateY + dy,
		});
	}, [isDragging]);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	// Fit to view
	const fitToView = useCallback(() => {
		setScale(1);
		setTranslate({ x: 0, y: 0 });
	}, []);

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

	// Compute connected node IDs for hover highlighting
	const connectedIds = useMemo(() => {
		if (!hoveredNodeId || !graphData) return new Set<string>();
		const connected = new Set<string>([hoveredNodeId]);
		for (const edge of graphData.edges) {
			if (edge.source === hoveredNodeId) {
				connected.add(edge.target);
			} else if (edge.target === hoveredNodeId) {
				connected.add(edge.source);
			}
		}
		return connected;
	}, [hoveredNodeId, graphData]);

	// Check if an element should be dimmed
	const isDimmed = useCallback(
		(nodeId: string) => {
			if (!hoveredNodeId) return false;
			return !connectedIds.has(nodeId);
		},
		[hoveredNodeId, connectedIds]
	);

	// Check if an edge should be dimmed
	const isEdgeDimmed = useCallback(
		(edge: GraphEdge) => {
			if (!hoveredNodeId) return false;
			return !connectedIds.has(edge.source) || !connectedIds.has(edge.target);
		},
		[hoveredNodeId, connectedIds]
	);

	return (
		<div className={`${styles.container} relation-graph`}>
			<div className={styles.controls}>
				<div className={styles.controlsContent}>
					<div className={styles.stats}>
						{entityCount} targets · {totalRelations} relations
					</div>
					<div className={styles.toolbar}>
						{/* Fit to view button */}
						<button
							className={styles.toolbarButton}
							onClick={fitToView}
							title="Fit to view"
						>
							<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
								<path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
							</svg>
						</button>
						{/* Filter toggle */}
						{relationNames.length > 0 && (
							<button
								className={`${styles.toolbarButton} ${
									showFilter ? styles.toolbarButtonActive : ''
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
						ref={svgRef}
						width={GRAPH_WIDTH}
						height={GRAPH_HEIGHT}
						className={`${styles.svg} ${isDragging ? styles.dragging : ''}`}
						viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseUp}
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

						{/* Transform group for zoom and pan */}
						<g transform={`translate(${translate.x}, ${translate.y}) scale(${scale})`}>
							{/* Edges */}
							<g className={styles.edges}>
								{graphData.edges.map((edge) => {
									const midX = (edge.sourceX + edge.targetX) / 2;
									const midY = (edge.sourceY + edge.targetY) / 2;
									return (
										<g key={edge.id} className={isEdgeDimmed(edge) ? styles.dimmed : ''}>
											<line
												x1={edge.sourceX}
												y1={edge.sourceY}
												x2={edge.targetX}
												y2={edge.targetY}
												className={styles.edge}
												markerEnd="url(#arrow)"
											/>
											{edge.relationName && (
												<text
													x={midX}
													y={midY - 4}
													className={styles.edgeLabel}
													textAnchor="middle"
												>
													{edge.relationName}
												</text>
											)}
										</g>
									);
								})}
							</g>

							{/* Nodes */}
							<g className={styles.nodes}>
								{graphData.nodes.map((node) => {
									if (node.type === 'aggregate') {
										return (
											<g
												key={node.id}
												className={`${styles.aggregateNode} ${isDimmed(node.id) ? styles.dimmed : ''}`}
												onClick={() => setSelectedAggregate(node)}
												onMouseEnter={() => setHoveredNodeId(node.id)}
												onMouseLeave={() => setHoveredNodeId(null)}
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
												className={`${styles.entityNode} ${isDimmed(node.id) ? styles.dimmed : ''}`}
												onClick={() => onSelectEntity(node.entity)}
												onMouseEnter={() => {
													handleEntityHover(node.entity);
													setHoveredNodeId(node.id);
												}}
												onMouseLeave={() => {
													handleEntityHover(null);
													setHoveredNodeId(null);
												}}
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
