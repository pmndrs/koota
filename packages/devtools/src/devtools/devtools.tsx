import { $internal, type Entity, type Trait, type World } from '@koota/core';
import { useEffect, useMemo, useRef } from 'react';
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
import { useAnimationFrame } from './hooks/use-animation-frame';
import { useNav } from './hooks/use-nav';
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

export function Devtools({
	world,
	defaultPosition = { x: 16, y: 16 },
	defaultOpen = true,
	editor = 'cursor',
}: DevtoolsProps) {
	const previousSelectedEntityRef = useRef<Entity | null>(null);
	const nav = useNav({ initialTab: 'entities' });
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

	const scrollToTop = () => {
		const el = document.querySelector('[data-koota-devtools-root] [data-koota-devtools-scroll]');
		if (el instanceof HTMLElement) {
			el.scrollTo({ top: 0 });
		}
	};

	const handleBack = () => {
		if (!nav.canGoBack) return;
		nav.actions.goBack();
		scrollToTop();
	};

	const handleSelectEntity = (entity: Entity, fromTab?: Tab) => {
		nav.actions.selectEntity(entity, fromTab);
		scrollToTop();
	};

	// Per-frame system to sync world highlight tags based on entity trait state
	useAnimationFrame(() => {
		runDevtoolsHighlightSystem(world, previousSelectedEntityRef, nav.actions.setSelectedEntity);
	});

	const handleTabChange = (tab: Tab) => {
		nav.actions.setTab(tab);
		scrollToTop();
	};

	// Sync entity selection highlight based on nav-only selection state
	useEffect(() => {
		const prev = previousSelectedEntityRef.current;
		const next = nav.selectedEntity;
		if (prev === next) return;

		if (prev !== null && world.has(prev)) {
			prev.remove(IsDevtoolsSelected);
			prev.remove(IsDevtoolsHovered);
		}

		if (next !== null && world.has(next)) {
			next.remove(IsDevtoolsHovered);
			next.add(IsDevtoolsSelected);
		}

		previousSelectedEntityRef.current = next;
	}, [nav.selectedEntity, world]);

	// Check if selected trait still exists
	const validSelectedTrait =
		nav.selectedTrait && traits.includes(nav.selectedTrait as Trait) ? nav.selectedTrait : null;

	// Check if selected entity still exists (explicit null check for entity 0)
	const validSelectedEntity =
		nav.selectedEntity !== null && world.has(nav.selectedEntity) ? nav.selectedEntity : null;

	return (
		<WorldProvider value={world}>
			<Panel defaultPosition={defaultPosition} defaultOpen={defaultOpen}>
				<Panel.Header>
					<Header
						traitCount={traits.length}
						entityCount={entityCount}
						relationCount={relationCount}
						activeTab={nav.activeTab}
						canGoBack={nav.canGoBack}
						onTabChange={handleTabChange}
						onBack={handleBack}
					/>
				</Panel.Header>
				<Panel.Content>
					{/* Graph view */}
					{nav.activeTab === 'graph' && (
						<RelationGraph
							relationTraits={relationTraits}
							onSelectEntity={(entity) => {
								handleSelectEntity(entity, 'graph');
								nav.actions.setActiveTab('entities');
							}}
						/>
					)}

					{/* Entities view */}
					{nav.activeTab === 'entities' && (
						<>
							{validSelectedEntity !== null ? (
								<EntityDetail
									key={validSelectedEntity}
									entity={validSelectedEntity}
									onSelectTrait={(trait) => {
										nav.actions.selectTrait(trait, 'traits');
										scrollToTop();
									}}
								/>
							) : (
								<AllEntitiesList onSelect={handleSelectEntity} />
							)}
						</>
					)}

					{/* Traits view */}
					{nav.activeTab === 'traits' && (
						<>
							{validSelectedTrait !== null ? (
								<TraitDetail
									key={validSelectedTrait[$internal].id}
									trait={validSelectedTrait}
									editor={editor}
									onSelectEntity={(entity) => {
										handleSelectEntity(entity, 'traits');
										nav.actions.setActiveTab('entities');
									}}
								/>
							) : (
								<TraitList
									traits={traits}
									onSelect={(trait) => {
										nav.actions.selectTrait(trait);
										scrollToTop();
									}}
								/>
							)}
						</>
					)}
				</Panel.Content>
			</Panel>
		</WorldProvider>
	);
}
