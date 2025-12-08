import { $internal, type Entity, type Trait, type World } from '@koota/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TraitWithDebug } from '../types';
import { IsDevtoolsHovered, IsDevtoolsSelected } from '../traits';
import { AllEntitiesList } from './components/all-entities-list';
import { EntityDetail } from './components/entity-detail';
import { Header, type Tab } from './components/header';
import { RelationGraph } from './components/relation-graph';
import { TraitDetail } from './components/trait-detail';
import { TraitList } from './components/trait-list';
import { getTraitType } from './components/trait-utils';
import { useAnimationFrame } from './hooks/use-animation-frame';
import { useDraggable } from './hooks/use-draggable';
import { useEntityCount } from './hooks/use-entity-count';
import { useWorldTraits } from './hooks/use-world-traits';
import { WorldProvider } from './hooks/use-world';
import { runDevtoolsHighlightSystem } from './utils/devtools-highlight-system';
import styles from './devtools.module.css';

export type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

export interface DevtoolsProps {
	world: World;
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
	editor?: Editor;
}

const typeClasses: Record<string, string> = {
	tag: styles.typeBtnTag,
	soa: styles.typeBtnSoa,
	aos: styles.typeBtnAos,
	rel: styles.typeBtnRel,
};

export function Devtools({
	world,
	defaultPosition = { x: 16, y: 16 },
	defaultOpen = true,
	editor = 'cursor',
}: DevtoolsProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const [activeTab, setActiveTab] = useState<Tab>('entities');
	const [filter, setFilter] = useState('');
	const [showFilters, setShowFilters] = useState(false);
	const [typeFilters, setTypeFilters] = useState({
		tag: true,
		soa: true,
		aos: true,
		rel: true,
	});
	const [showEmpty, setShowEmpty] = useState(true);
	const [zoom, setZoom] = useState(1);
	const [selectedTrait, setSelectedTrait] = useState<TraitWithDebug | null>(null);
	const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
	const previousSelectedEntityRef = useRef<Entity | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const { position, isDragging, handleMouseDown } = useDraggable(defaultPosition);
	const traits = useWorldTraits(world);
	const entityCount = useEntityCount(world);

	// Get relation traits for graph
	// Memoize to prevent unnecessary graph rerenders
	const relationTraits = useMemo(() => {
		return traits.filter((trait) => getTraitType(trait) === 'rel') as TraitWithDebug[];
	}, [
		// Create a stable key from relation trait IDs
		// This string will change when relation traits are added/removed
		traits
			.filter((trait) => getTraitType(trait) === 'rel')
			.map((t) => t[$internal].id)
			.sort()
			.join(','),
		// Include traits to ensure we always use the latest traits array
		// The key comparison prevents unnecessary updates when relation traits haven't changed
		traits,
	]);
	const relationCount = relationTraits.length;

	const toggleType = (type: 'tag' | 'soa' | 'aos' | 'rel') => {
		setTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
	};

	const scrollToTop = () => {
		scrollRef.current?.scrollTo({ top: 0 });
	};

	const handleSelectEntity = (entity: Entity) => {
		// Remove trait from previous entity
		if (
			previousSelectedEntityRef.current !== null &&
			world.has(previousSelectedEntityRef.current)
		) {
			previousSelectedEntityRef.current.remove(IsDevtoolsSelected);
			previousSelectedEntityRef.current.remove(IsDevtoolsHovered);
		}

		// Add trait to new entity
		if (world.has(entity)) {
			entity.remove(IsDevtoolsHovered);
			entity.add(IsDevtoolsSelected);
		}

		previousSelectedEntityRef.current = entity;
		setSelectedEntity(entity);
		scrollToTop();
	};

	const handleDeselectEntity = () => {
		// Remove traits from previous entity
		if (
			previousSelectedEntityRef.current !== null &&
			world.has(previousSelectedEntityRef.current)
		) {
			previousSelectedEntityRef.current.remove(IsDevtoolsSelected);
			previousSelectedEntityRef.current.remove(IsDevtoolsHovered);
		}

		previousSelectedEntityRef.current = null;
		setSelectedEntity(null);
		scrollToTop();
	};

	// Per-frame system to sync world highlight tags based on entity trait state
	useAnimationFrame(() => {
		runDevtoolsHighlightSystem(world, previousSelectedEntityRef, setSelectedEntity);
	});

	const handleTabChange = (tab: Tab) => {
		setActiveTab(tab);
		setSelectedTrait(null);
		handleDeselectEntity();
		setFilter('');
		setShowFilters(false);
	};

	const activeFilterCount = Object.values(typeFilters).filter((v) => !v).length;

	const handleZoomIn = useCallback(() => {
		setZoom((prev) => Math.min(prev + 0.1, 2));
	}, []);

	const handleZoomOut = useCallback(() => {
		setZoom((prev) => Math.max(prev - 0.1, 0.5));
	}, []);

	const handleZoomReset = useCallback(() => {
		setZoom(1);
	}, []);

	// Keyboard shortcuts for zoom
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd/Ctrl + Plus or Equals
			if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '=')) {
				e.preventDefault();
				handleZoomIn();
			}
			// Cmd/Ctrl + Minus
			if ((e.metaKey || e.ctrlKey) && e.key === '-') {
				e.preventDefault();
				handleZoomOut();
			}
			// Cmd/Ctrl + 0 (reset)
			if ((e.metaKey || e.ctrlKey) && e.key === '0') {
				e.preventDefault();
				handleZoomReset();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleZoomIn, handleZoomOut, handleZoomReset]);

	// Check if selected trait still exists
	const validSelectedTrait =
		selectedTrait && traits.includes(selectedTrait as Trait) ? selectedTrait : null;

	// Check if selected entity still exists (explicit null check for entity 0)
	const validSelectedEntity =
		selectedEntity !== null && world.has(selectedEntity) ? selectedEntity : null;

	return (
		<WorldProvider value={world}>
			<div
				className={styles.container}
				style={{
					top: position.y,
					left: position.x,
					transform: `scale(${zoom})`,
					transformOrigin: 'top left',
				}}
				data-koota-devtools-root
			>
				<div className={`${styles.panel} panel`}>
					<Header
						traitCount={traits.length}
						entityCount={entityCount}
						relationCount={relationCount}
						isOpen={isOpen}
						isDragging={isDragging}
						activeTab={activeTab}
						onTabChange={handleTabChange}
						onToggle={() => setIsOpen(!isOpen)}
						onMouseDown={handleMouseDown}
					/>
					{isOpen && (
						<div ref={scrollRef} className={styles.list}>
							{/* Graph view */}
							{activeTab === 'graph' && (
								<RelationGraph
									relationTraits={relationTraits}
									onSelectEntity={(entity) => {
										handleSelectEntity(entity);
										setActiveTab('entities');
									}}
								/>
							)}

							{/* Entities view */}
							{activeTab === 'entities' && (
								<>
									{validSelectedEntity !== null ? (
										<EntityDetail
											key={validSelectedEntity}
											entity={validSelectedEntity}
											zoom={zoom}
											onBack={handleDeselectEntity}
											onSelectTrait={(trait) => {
												setSelectedTrait(() => trait);
												setActiveTab('traits');
												scrollToTop();
											}}
										/>
									) : (
										<AllEntitiesList onSelect={handleSelectEntity} />
									)}
								</>
							)}

							{/* Traits view */}
							{activeTab === 'traits' && (
								<>
									{validSelectedTrait !== null ? (
										<TraitDetail
											key={validSelectedTrait[$internal].id}
											trait={validSelectedTrait}
											editor={editor}
											scrollRef={scrollRef}
											onBack={() => {
												setSelectedTrait(null);
												scrollToTop();
											}}
											onSelectEntity={(entity) => {
												handleSelectEntity(entity);
												setActiveTab('entities');
											}}
										/>
									) : (
										<>
											<div className={styles.filterRow}>
												<input
													type="text"
													placeholder="Filter…"
													value={filter}
													onChange={(e) => setFilter(e.target.value)}
													className={styles.filterInput}
												/>
												<button
													className={`${styles.filterToggle} ${
														showFilters ? styles.filterToggleActive : ''
													}`}
													onClick={() => setShowFilters(!showFilters)}
													title="Filter by type"
												>
													<svg
														width="12"
														height="12"
														viewBox="0 0 16 16"
														fill="currentColor"
													>
														<path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
													</svg>
													{activeFilterCount > 0 && (
														<span className={styles.filterBadge}>
															{activeFilterCount}
														</span>
													)}
												</button>
											</div>
											{showFilters && (
												<div className={styles.filterTypes}>
													{(['tag', 'soa', 'aos', 'rel'] as const).map(
														(type) => (
															<button
																key={type}
																className={`${styles.typeBtn} ${
																	typeClasses[type]
																} ${
																	typeFilters[type]
																		? styles.typeBtnActive
																		: ''
																}`}
																onClick={() => toggleType(type)}
															>
																{type}
															</button>
														)
													)}
													<button
														className={`${styles.typeBtn} ${
															styles.typeBtnEmpty
														} ${showEmpty ? styles.typeBtnActive : ''}`}
														onClick={() => setShowEmpty(!showEmpty)}
														title="Show traits with 0 entities"
													>
														empty
													</button>
												</div>
											)}
											<TraitList
												traits={traits}
												filter={filter}
												typeFilters={typeFilters}
												showEmpty={showEmpty}
												onSelect={(trait) => {
													setSelectedTrait(() => trait);
													scrollToTop();
												}}
											/>
										</>
									)}
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</WorldProvider>
	);
}
