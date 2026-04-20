import type { Entity, World } from '@koota/core';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Tab } from '../shared/header';
import type { TraitWithDebug } from '../../types';

export type NavEntry = { tab: Tab; entity?: Entity; trait?: TraitWithDebug; world?: World };

export interface UseDevtoolsNavOptions {
	initialTab?: Tab;
	/** When set, skip the world picker and start inside this world. */
	initialWorld?: World;
}

export interface NavState {
	activeTab: Tab;
	selectedWorld: World | null;
	selectedEntity: Entity | null;
	selectedTrait: TraitWithDebug | null;
	navHistory: NavEntry[];
	canGoBack: boolean;
}

export interface DevtoolsNavActions {
	setTab: (tab: Tab) => void;
	setActiveTab: (tab: Tab) => void;
	goBack: () => void;
	selectWorld: (world: World) => void;
	deselectWorld: () => void;
	selectEntity: (entity: Entity, fromTab?: Tab) => void;
	deselectEntity: () => void;
	selectTrait: (trait: TraitWithDebug, nextTab?: Tab) => void;
	deselectTrait: () => void;
	setSelectedEntity: (entity: Entity | null) => void;
}

export interface UseNavResult extends NavState {
	actions: DevtoolsNavActions;
}

export function useNav(options: UseDevtoolsNavOptions = {}): UseNavResult {
	const { initialTab = 'entities', initialWorld } = options;

	const [activeTab, _setActiveTab] = useState<Tab>(initialWorld ? initialTab : 'worlds');
	const [selectedWorld, _setSelectedWorld] = useState<World | null>(initialWorld ?? null);
	const [selectedEntity, _setSelectedEntity] = useState<Entity | null>(null);
	const [selectedTrait, _setSelectedTrait] = useState<TraitWithDebug | null>(null);
	const [navHistory, setNavHistory] = useState<NavEntry[]>([]);

	const activeTabRef = useRef<Tab>(initialWorld ? initialTab : 'worlds');
	const selectedWorldRef = useRef<World | null>(initialWorld ?? null);
	const selectedEntityRef = useRef<Entity | null>(null);
	const selectedTraitRef = useRef<TraitWithDebug | null>(null);

	const setActiveTab = useCallback((tab: Tab) => {
		activeTabRef.current = tab;
		_setActiveTab(tab);
	}, []);

	const setSelectedWorld = useCallback((world: World | null) => {
		selectedWorldRef.current = world;
		_setSelectedWorld(world);
	}, []);

	const setSelectedEntity = useCallback((entity: Entity | null) => {
		selectedEntityRef.current = entity;
		_setSelectedEntity(entity);
	}, []);

	const setSelectedTrait = useCallback((trait: TraitWithDebug | null) => {
		selectedTraitRef.current = trait;
		_setSelectedTrait(trait);
	}, []);

	const pushCurrentToHistory = useCallback((fromTab?: Tab) => {
		setNavHistory((prev) => [
			...prev,
			{
				tab: fromTab ?? activeTabRef.current,
				world: selectedWorldRef.current ?? undefined,
				entity: selectedEntityRef.current ?? undefined,
				trait: selectedTraitRef.current ?? undefined,
			},
		]);
	}, []);

	const goBack = useCallback(() => {
		setNavHistory((prev) => {
			if (prev.length === 0) return prev;
			const previous = prev[prev.length - 1];
			setActiveTab(previous.tab);
			setSelectedWorld(previous.world ?? null);
			setSelectedEntity(previous.entity ?? null);
			setSelectedTrait(previous.trait ?? null);
			return prev.slice(0, -1);
		});
	}, [setActiveTab, setSelectedWorld, setSelectedEntity, setSelectedTrait]);

	const selectWorld = useCallback(
		(world: World) => {
			pushCurrentToHistory();
			setSelectedWorld(world);
			setActiveTab('entities');
			setSelectedEntity(null);
			setSelectedTrait(null);
		},
		[pushCurrentToHistory, setSelectedWorld, setActiveTab, setSelectedEntity, setSelectedTrait]
	);

	const deselectWorld = useCallback(() => {
		setSelectedWorld(null);
		setSelectedEntity(null);
		setSelectedTrait(null);
		setActiveTab('worlds');
		setNavHistory([]);
	}, [setSelectedWorld, setSelectedEntity, setSelectedTrait, setActiveTab]);

	const selectEntity = useCallback(
		(entity: Entity, fromTab?: Tab) => {
			pushCurrentToHistory(fromTab);
			setSelectedEntity(entity);
		},
		[pushCurrentToHistory, setSelectedEntity]
	);

	const deselectEntity = useCallback(() => {
		setSelectedEntity(null);
	}, [setSelectedEntity]);

	const selectTrait = useCallback(
		(trait: TraitWithDebug, nextTab?: Tab) => {
			pushCurrentToHistory();
			setSelectedTrait(trait);
			if (nextTab) setActiveTab(nextTab);
		},
		[pushCurrentToHistory, setActiveTab, setSelectedTrait]
	);

	const deselectTrait = useCallback(() => {
		setSelectedTrait(null);
	}, [setSelectedTrait]);

	const setTab = useCallback(
		(tab: Tab) => {
			if (tab === 'worlds') {
				deselectWorld();
				return;
			}
			setActiveTab(tab);
			if (tab !== 'info') {
				setSelectedTrait(null);
				setSelectedEntity(null);
			}
			setNavHistory([]);
		},
		[setActiveTab, setSelectedEntity, setSelectedTrait, deselectWorld]
	);

	const canGoBack = navHistory.length > 0;

	return useMemo(
		() => ({
			activeTab,
			selectedWorld,
			selectedEntity,
			selectedTrait,
			navHistory,
			canGoBack,
			actions: {
				setTab,
				setActiveTab,
				goBack,
				selectWorld,
				deselectWorld,
				selectEntity,
				deselectEntity,
				selectTrait,
				deselectTrait,
				setSelectedEntity,
			},
		}),
		[
			activeTab,
			selectedWorld,
			selectedEntity,
			selectedTrait,
			navHistory,
			canGoBack,
			setTab,
			setActiveTab,
			goBack,
			selectWorld,
			deselectWorld,
			selectEntity,
			deselectEntity,
			selectTrait,
			deselectTrait,
			setSelectedEntity,
		]
	);
}
