import type { Entity, World } from '@koota/core';
import { $internal } from '@koota/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { TraitWithDebug } from '../../types';
import { getTraitName } from './trait-utils';
import { buildGraphData, type GraphData } from '../utils/build-graph-data';
import styles from './relation-graph.module.css';

interface RelationGraphProps {
	world: World;
	relationTraits: TraitWithDebug[];
	onSelectEntity: (entity: Entity) => void;
}

export function RelationGraph({ world, relationTraits, onSelectEntity }: RelationGraphProps) {
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
	const [showFilter, setShowFilter] = useState(false);
	const graphRef = useRef<any>(null);
	const previousNodesRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(
		new Map()
	);
	const isDraggingRef = useRef(false);

	const updateGraph = useCallback(() => {
		if (isDraggingRef.current) return;

		setIsGenerating(true);
		setTimeout(() => {
			// Filter relation traits based on selection
			const filteredTraits =
				selectedRelations.size === 0
					? relationTraits
					: relationTraits.filter((trait) => {
							const traitCtx = trait[$internal];
							const relation = traitCtx.relation;
							if (!relation) return false;
							const relationName = getTraitName(trait);
							return selectedRelations.has(relationName);
					  });

			const newData = buildGraphData(world, filteredTraits);

			// Preserve positions from previous graph to prevent sudden jumps
			const nodesWithPreservedPositions = newData.nodes.map((node) => {
				const previous = previousNodesRef.current.get(node.id);
				if (previous) {
					// Preserve position and reset velocity for smoother transitions
					return {
						...node,
						x: previous.x,
						y: previous.y,
						vx: 0,
						vy: 0,
					};
				}

				// New node: try to find a neighbor to spawn near
				const neighborLink = newData.links.find(
					(l) => l.source === node.id || l.target === node.id
				);
				if (neighborLink) {
					const neighborId =
						neighborLink.source === node.id ? neighborLink.target : neighborLink.source;
					const neighbor = previousNodesRef.current.get(neighborId as string);
					if (neighbor) {
						return {
							...node,
							x: neighbor.x + (Math.random() - 0.5) * 10,
							y: neighbor.y + (Math.random() - 0.5) * 10,
							vx: 0,
							vy: 0,
						};
					}
				}

				// Fallback: start at center with zero velocity
				return {
					...node,
					x: 130,
					y: 125,
					vx: 0,
					vy: 0,
				};
			});

			// Update previous positions cache
			previousNodesRef.current.clear();
			nodesWithPreservedPositions.forEach((node) => {
				if (node.x !== undefined && node.y !== undefined) {
					previousNodesRef.current.set(node.id, {
						x: node.x,
						y: node.y,
						vx: node.vx || 0,
						vy: node.vy || 0,
					});
				}
			});

			setGraphData({
				...newData,
				nodes: nodesWithPreservedPositions,
			});
			setIsGenerating(false);
		}, 0);
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

	// Generate graph data when component mounts or when relations change
	useEffect(() => {
		if (relationTraits.length === 0) {
			setGraphData({ nodes: [], links: [] });
			return;
		}

		// Initial update
		updateGraph();

		// Subscribe to changes for each relation trait
		const unsubs: (() => void)[] = [];
		let timeout: ReturnType<typeof setTimeout>;

		const scheduleUpdate = () => {
			clearTimeout(timeout);
			timeout = setTimeout(updateGraph, 50);
		};

		for (const trait of relationTraits) {
			unsubs.push(world.onAdd(trait, scheduleUpdate));
			unsubs.push(world.onRemove(trait, scheduleUpdate));
			// Subscribe to changes in case targets change
			unsubs.push(world.onChange(trait, scheduleUpdate));
		}

		return () => {
			clearTimeout(timeout);
			unsubs.forEach((unsub) => unsub());
		};
	}, [world, relationTraits, updateGraph]);

	return (
		<div className={`${styles.container} relation-graph`}>
			<div className={styles.controls}>
				<div className={styles.controlsContent}>
					<div className={styles.stats}>
						{graphData?.nodes.length ?? 0} entities · {graphData?.links.length ?? 0}{' '}
						relations
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
				{isGenerating ? (
					<div className={styles.empty}>
						<div className={styles.emptyMessage}>Generating graph...</div>
					</div>
				) : !graphData ||
				  !graphData.nodes ||
				  !graphData.links ||
				  graphData.nodes.length === 0 ? (
					<div className={styles.empty}>
						<div className={styles.emptyMessage}>No relations found</div>
						<div className={styles.emptySubtext}>
							Create some relations to visualize them
						</div>
					</div>
				) : (
					<ForceGraph2D
						ref={graphRef}
						graphData={graphData}
						nodeLabel={(_node: any) => _node?.label || `Node ${_node?.id || '?'}`}
						nodeColor={() => '#4a9eff'}
						nodeVal={() => 2}
						linkLabel={(link: any) => link?.relationName || 'Relation'}
						linkColor={() => '#666'}
						linkWidth={1}
						linkDirectionalArrowLength={6}
						linkDirectionalArrowRelPos={1}
						onNodeClick={(node: any) => {
							if (node?.entity) {
								onSelectEntity(node.entity);
							}
						}}
						// @ts-expect-error - d3Force prop exists but types may be incomplete
						d3Force={(d3: any) => {
							// Reduce forces to prevent sudden movements
							d3.force('charge')?.strength(-15); // Much weaker repulsion
							d3.force('link')?.distance(20).strength(0.3); // Shorter links, weaker pull
							d3.force('center')?.strength(0.01); // Very weak center force
							// Add alpha decay to slow down simulation
							d3.alphaDecay(0.05); // Faster decay = less movement
						}}
						onNodeDragStart={(_node: any) => {
							isDraggingRef.current = true;
						}}
						onNodeDragEnd={(_node: any) => {
							isDraggingRef.current = false;
							// Update position cache when node is dragged
							if (_node.x !== undefined && _node.y !== undefined) {
								previousNodesRef.current.set(_node.id, {
									x: _node.x,
									y: _node.y,
									vx: 0,
									vy: 0,
								});
							}
						}}
						onEngineTick={() => {
							// Update position cache during simulation
							if (graphData?.nodes) {
								graphData.nodes.forEach((_node: any) => {
									if (_node.x !== undefined && _node.y !== undefined) {
										previousNodesRef.current.set(_node.id, {
											x: _node.x,
											y: _node.y,
											vx: _node.vx || 0,
											vy: _node.vy || 0,
										});
									}
								});
							}
						}}
						cooldownTicks={100}
						onEngineStop={() => {
							// Simulation stopped - graph is now static
						}}
						width={260}
						height={250}
					/>
				)}
			</div>
		</div>
	);
}
