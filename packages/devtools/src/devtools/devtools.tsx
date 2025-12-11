import { $internal, type Entity, type Trait, type World } from '@koota/core';
import { useMemo, useRef, useState } from 'react';
import { IsDevtoolsHovered, IsDevtoolsSelected } from '../traits';
import type { TraitWithDebug } from '../types';
import { AllEntitiesList } from './components/all-entities-list';
import { EntityDetail } from './components/entity-detail';
import { Header, type Tab } from './components/header';
import { Panel } from './components/panel';
import { RelationGraph } from './components/relation-graph';
import { TraitDetail } from './components/trait-detail';
import { TraitList } from './components/trait-list';
import { getTraitType } from './components/trait-utils';
import styles from './devtools.module.css';
import { useAnimationFrame } from './hooks/use-animation-frame';
import { useEntityCount } from './hooks/use-entity-count';
import { WorldProvider } from './hooks/use-world';
import { useWorldTraits } from './hooks/use-world-traits';
import { runDevtoolsHighlightSystem } from './utils/devtools-highlight-system';

export type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

export interface DevtoolsProps {
	world: World;
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
	editor?: Editor;
}

type NavEntry = { tab: Tab; entity?: Entity; trait?: TraitWithDebug };

const typeClasses: Record<string, string> = {
	tag: styles.typeTag,
	soa: styles.typeSoa,
	aos: styles.typeAos,
	rel: styles.typeRel,
};

export function Devtools({
	world,
	defaultPosition = { x: 16, y: 16 },
	defaultOpen = true,
	editor = 'cursor',
}: DevtoolsProps) {
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
	const [selectedTrait, setSelectedTrait] = useState<TraitWithDebug | null>(null);
	const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
	const [navHistory, setNavHistory] = useState<NavEntry[]>([]);
	const previousSelectedEntityRef = useRef<Entity | null>(null);
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
		const el = document.querySelector('[data-koota-devtools-root] [data-koota-devtools-scroll]');
		if (el instanceof HTMLElement) {
			el.scrollTo({ top: 0 });
		}
	};

	const handleBack = () => {
		if (navHistory.length === 0) return;

		const previous = navHistory[navHistory.length - 1];
		setNavHistory((prev) => prev.slice(0, -1));

		// Restore previous state
		setActiveTab(previous.tab);
		setSelectedEntity(previous.entity ?? null);
		setSelectedTrait(previous.trait ?? null);

		// Sync entity selection highlight
		if (previous.entity) {
			if (
				previousSelectedEntityRef.current !== null &&
				world.has(previousSelectedEntityRef.current)
			) {
				previousSelectedEntityRef.current.remove(IsDevtoolsSelected);
				previousSelectedEntityRef.current.remove(IsDevtoolsHovered);
			}
			if (world.has(previous.entity)) {
				previous.entity.remove(IsDevtoolsHovered);
				previous.entity.add(IsDevtoolsSelected);
			}
			previousSelectedEntityRef.current = previous.entity;
		} else {
			if (
				previousSelectedEntityRef.current !== null &&
				world.has(previousSelectedEntityRef.current)
			) {
				previousSelectedEntityRef.current.remove(IsDevtoolsSelected);
				previousSelectedEntityRef.current.remove(IsDevtoolsHovered);
			}
			previousSelectedEntityRef.current = null;
		}

		scrollToTop();
	};

	const handleSelectEntity = (entity: Entity, fromTab?: Tab) => {
		// Push current state to history
		setNavHistory((prev) => [
			...prev,
			{
				tab: fromTab ?? activeTab,
				entity: selectedEntity ?? undefined,
				trait: selectedTrait ?? undefined,
			},
		]);

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
		setNavHistory([]); // Clear history on explicit tab switch
	};

	const activeFilterCount = Object.values(typeFilters).filter((v) => !v).length;

	// Check if selected trait still exists
	const validSelectedTrait =
		selectedTrait && traits.includes(selectedTrait as Trait) ? selectedTrait : null;

	// Check if selected entity still exists (explicit null check for entity 0)
	const validSelectedEntity =
		selectedEntity !== null && world.has(selectedEntity) ? selectedEntity : null;

	return (
		<WorldProvider value={world}>
			<Panel defaultPosition={defaultPosition} defaultOpen={defaultOpen}>
				<Panel.Header>
					<Header
						traitCount={traits.length}
						entityCount={entityCount}
						relationCount={relationCount}
						activeTab={activeTab}
						canGoBack={navHistory.length > 0}
						onTabChange={handleTabChange}
						onBack={handleBack}
					/>
				</Panel.Header>
				<Panel.Content>
					{/* Graph view */}
					{activeTab === 'graph' && (
						<RelationGraph
							relationTraits={relationTraits}
							onSelectEntity={(entity) => {
								handleSelectEntity(entity, 'graph');
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
									onSelectTrait={(trait) => {
										// Push current state to history
										setNavHistory((prev) => [
											...prev,
											{
												tab: activeTab,
												entity: selectedEntity ?? undefined,
												trait: selectedTrait ?? undefined,
											},
										]);
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
									onSelectEntity={(entity) => {
										handleSelectEntity(entity, 'traits');
										setActiveTab('entities');
									}}
								/>
							) : (
								<>
									<div className={styles.row}>
										<input
											type="text"
											placeholder="Filter…"
											value={filter}
											onChange={(e) => setFilter(e.target.value)}
											className={styles.input}
										/>
										<button
											className={`${styles.toggle} ${
												showFilters ? styles.toggleActive : ''
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
												<span className={styles.badge}>
													{activeFilterCount}
												</span>
											)}
										</button>
									</div>
									{showFilters && (
										<div className={styles.types}>
											{(['tag', 'soa', 'aos', 'rel'] as const).map((type) => (
												<button
													key={type}
													className={`${styles.type} ${typeClasses[type]} ${
														typeFilters[type] ? styles.typeActive : ''
													}`}
													onClick={() => toggleType(type)}
												>
													{type}
												</button>
											))}
											<button
												className={`${styles.type} ${styles.typeEmpty} ${
													showEmpty ? styles.typeActive : ''
												}`}
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
											// Push current state to history
											setNavHistory((prev) => [
												...prev,
												{
													tab: activeTab,
													entity: selectedEntity ?? undefined,
													trait: selectedTrait ?? undefined,
												},
											]);
											setSelectedTrait(() => trait);
											scrollToTop();
										}}
									/>
								</>
							)}
						</>
					)}
				</Panel.Content>
			</Panel>
		</WorldProvider>
	);
}
