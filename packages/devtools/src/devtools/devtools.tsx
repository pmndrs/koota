import { $internal, type Entity, type World } from '@koota/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IsDevtoolsHovered, IsDevtoolsInspecting, IsDevtoolsSelected } from '../traits';
import type { Editor, TraitWithDebug } from '../types';
import { EntitiesPage } from './entities/entities-page';
import { RelationGraph } from './graph/relation-graph';
import { useAnimationFrame } from './hooks/use-animation-frame';
import { useEntityCount } from './hooks/use-entity-count';
import { useNav } from './hooks/use-nav';
import { WorldProvider } from './hooks/use-world';
import { useWorldTraits } from './hooks/use-world-traits';
import { useWorlds } from './hooks/use-worlds';
import { Header, type Tab } from './shared/header';
import { Panel } from './shared/panel';
import { getTraitType, resolveTraitById } from './shared/trait-utils';
import { TraitsPage } from './traits/traits-page';
import { runDevtoolsHighlightSystem } from './utils/devtools-highlight-system';
import type { TypeFilters } from './traits/trait-list';
import { WorldDetail } from './worlds/world-detail';
import { WorldList } from './worlds/world-list';

const relOnlyFilter: TypeFilters = { tag: false, soa: false, aos: false, rel: true };

export type { Editor } from '../types';

export interface DevtoolsProps {
	/** @deprecated Use `worlds` instead. */
	world?: World;
	worlds?: World[];
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
	editor?: Editor;
}

export function Devtools({
	world: singleWorld,
	worlds: explicitWorlds,
	defaultPosition = { x: 16, y: 16 },
	defaultOpen = true,
	editor = 'cursor',
}: DevtoolsProps) {
	const resolvedExplicit = explicitWorlds ?? (singleWorld ? [singleWorld] : undefined);
	const worlds = useWorlds(resolvedExplicit);
	const isSingleWorld = worlds.length === 1;

	const nav = useNav({
		initialTab: 'entities',
		initialWorld: isSingleWorld ? worlds[0] : undefined,
	});

	useEffect(() => {
		if (worlds.length === 1 && nav.selectedWorld === null) {
			nav.actions.selectWorld(worlds[0]);
		}
	}, [worlds, nav.selectedWorld, nav.actions]);

	const showWorldList = nav.activeTab === 'worlds' || nav.selectedWorld === null;

	return (
		<Panel defaultPosition={defaultPosition} defaultOpen={defaultOpen}>
			{showWorldList ? (
				<>
					<Panel.Header>
						<Header
							activeTab="worlds"
							canGoBack={false}
							isInspecting={false}
							worldCount={worlds.length}
							onTabChange={nav.actions.setTab}
							onBack={() => {}}
							onToggleInspect={() => {}}
						/>
					</Panel.Header>
					<Panel.Content>
						<WorldList worlds={worlds} onSelect={nav.actions.selectWorld} />
					</Panel.Content>
				</>
			) : (
				<WorldView
					world={nav.selectedWorld!}
					nav={nav}
					editor={editor}
					showWorldsTab={!isSingleWorld}
				/>
			)}
		</Panel>
	);
}

// --- WorldView (internal) ---

interface WorldViewProps {
	world: World;
	nav: ReturnType<typeof useNav>;
	editor: Editor;
	showWorldsTab: boolean;
}

function scrollToTop() {
	const el = document.querySelector('[data-koota-devtools-root] [data-koota-devtools-scroll]');
	if (el instanceof HTMLElement) el.scrollTo({ top: 0 });
}

function WorldView({ world, nav, editor, showWorldsTab }: WorldViewProps) {
	const previousSelectedEntityRef = useRef<Entity | null>(null);
	const [isInspecting, setIsInspecting] = useState(false);
	const [traitTypeFilter, setTraitTypeFilter] = useState<TypeFilters | undefined>();
	const traits = useWorldTraits(world);
	const entityCount = useEntityCount(world);

	const handleToggleInspect = useCallback(() => {
		setIsInspecting((prev) => {
			const next = !prev;
			if (next) world.add(IsDevtoolsInspecting);
			else world.remove(IsDevtoolsInspecting);
			return next;
		});
	}, [world]);

	// Stable memo key: only recompute when the set of relation trait IDs changes.
	const relationIdKey = traits
		.filter((t) => getTraitType(t) === 'rel')
		.map((t) => t[$internal].id)
		.sort()
		.join(',');

	const relationTraits = useMemo(
		() => traits.filter((t) => getTraitType(t) === 'rel') as TraitWithDebug[],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[relationIdKey]
	);

	const handleTabChange = useCallback(
		(tab: Tab) => {
			setTraitTypeFilter(undefined);
			nav.actions.setTab(tab);
			scrollToTop();
		},
		[nav.actions]
	);

	const handleSelectEntity = useCallback(
		(entity: Entity, fromTab?: Tab) => {
			nav.actions.selectEntity(entity, fromTab);
			scrollToTop();
		},
		[nav.actions]
	);

	const handleBack = useCallback(() => {
		if (nav.canGoBack) {
			nav.actions.goBack();
			scrollToTop();
		} else if (showWorldsTab) {
			nav.actions.deselectWorld();
		}
	}, [nav.canGoBack, nav.actions, showWorldsTab]);

	useAnimationFrame(() => {
		runDevtoolsHighlightSystem(world, previousSelectedEntityRef, nav.actions.setSelectedEntity);
	});

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

		if (next !== null && isInspecting) {
			setIsInspecting(false);
			world.remove(IsDevtoolsInspecting);
		}
	}, [nav.selectedEntity, world, isInspecting]);

	const validSelectedTrait = resolveTraitById(traits, nav.selectedTrait?.[$internal]?.id ?? null);
	const validSelectedEntity =
		nav.selectedEntity !== null && world.has(nav.selectedEntity) ? nav.selectedEntity : null;
	const canGoBack = showWorldsTab || nav.canGoBack;

	return (
		<WorldProvider value={world}>
			<Panel.Header>
				<Header
					traitCount={traits.length}
					entityCount={entityCount}
					relationCount={relationTraits.length}
					activeTab={nav.activeTab}
					canGoBack={canGoBack}
					isInspecting={isInspecting}
					showWorldsTab={showWorldsTab}
					worldLabel={`World ${world.id}`}
					onTabChange={handleTabChange}
					onBack={handleBack}
					onToggleInspect={handleToggleInspect}
				/>
			</Panel.Header>
			<Panel.Content>
				{nav.activeTab === 'info' && (
					<WorldDetail
						world={world}
						onNavigateEntities={() => handleTabChange('entities')}
						onNavigateTraits={() => handleTabChange('traits')}
						onNavigateRelations={() => {
							setTraitTypeFilter(relOnlyFilter);
							nav.actions.setTab('traits');
							scrollToTop();
						}}
						onSelectEntity={(entity) => {
							handleSelectEntity(entity, 'info');
							nav.actions.setActiveTab('entities');
						}}
					/>
				)}

				{nav.activeTab === 'graph' && (
					<RelationGraph
						relationTraits={relationTraits}
						onSelectEntity={(entity) => {
							handleSelectEntity(entity, 'graph');
							nav.actions.setActiveTab('entities');
						}}
					/>
				)}

				{nav.activeTab === 'entities' && (
					<EntitiesPage
						selectedEntity={validSelectedEntity}
						onSelectEntity={handleSelectEntity}
						onSelectTrait={(trait) => {
							nav.actions.selectTrait(trait, 'traits');
							scrollToTop();
						}}
					/>
				)}

				{nav.activeTab === 'traits' && (
					<TraitsPage
						traits={traits}
						editor={editor}
						selectedTrait={validSelectedTrait}
						initialTypeFilters={traitTypeFilter}
						onSelectTrait={(trait) => {
							nav.actions.selectTrait(trait);
							scrollToTop();
						}}
						onSelectEntity={(entity) => {
							handleSelectEntity(entity, 'traits');
							nav.actions.setActiveTab('entities');
						}}
					/>
				)}
			</Panel.Content>
		</WorldProvider>
	);
}
