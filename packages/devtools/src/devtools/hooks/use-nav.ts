import type { Entity } from '@koota/core';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Tab } from '../components/header';
import type { TraitWithDebug } from '../../types';

export type NavEntry = { tab: Tab; entity?: Entity; trait?: TraitWithDebug };

export interface UseDevtoolsNavOptions {
	initialTab?: Tab;
}

export interface NavState {
	activeTab: Tab;
	selectedEntity: Entity | null;
	selectedTrait: TraitWithDebug | null;
	navHistory: NavEntry[];
	canGoBack: boolean;
}

export interface DevtoolsNavActions {
	/**
	 * Explicit tab switch (via header): clears history + selection (matches existing behavior).
	 */
	setTab: (tab: Tab) => void;
	/**
	 * Internal/programmatic tab change (e.g. selecting from graph/trait detail): does NOT clear history.
	 */
	setActiveTab: (tab: Tab) => void;

	goBack: () => void;

	selectEntity: (entity: Entity, fromTab?: Tab) => void;
	deselectEntity: () => void;

	selectTrait: (trait: TraitWithDebug, nextTab?: Tab) => void;
	deselectTrait: () => void;

	/**
	 * Escape hatch for external sync (e.g. entity destroyed) to clear selection.
	 */
	setSelectedEntity: (entity: Entity | null) => void;
}

export interface UseNavResult extends NavState {
	actions: DevtoolsNavActions;
}

export function useNav(options: UseDevtoolsNavOptions = {}): UseNavResult {
	const { initialTab = 'entities' } = options;

	const [activeTab, _setActiveTab] = useState<Tab>(initialTab);
	const [selectedEntity, _setSelectedEntity] = useState<Entity | null>(null);
	const [selectedTrait, _setSelectedTrait] = useState<TraitWithDebug | null>(null);
	const [navHistory, setNavHistory] = useState<NavEntry[]>([]);

	// refs ensure history snapshots use the latest values even with stable callbacks
	const activeTabRef = useRef<Tab>(initialTab);
	const selectedEntityRef = useRef<Entity | null>(null);
	const selectedTraitRef = useRef<TraitWithDebug | null>(null);

	const setActiveTab = useCallback((tab: Tab) => {
		activeTabRef.current = tab;
		_setActiveTab(tab);
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
			setSelectedEntity(previous.entity ?? null);
			setSelectedTrait(previous.trait ?? null);

			return prev.slice(0, -1);
		});
	}, [setActiveTab, setSelectedEntity, setSelectedTrait]);

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
			setActiveTab(tab);
			setSelectedTrait(null);
			setSelectedEntity(null);
			setNavHistory([]);
		},
		[setActiveTab, setSelectedEntity, setSelectedTrait]
	);

	const canGoBack = navHistory.length > 0;

	return useMemo(
		() => ({
			activeTab,
			selectedEntity,
			selectedTrait,
			navHistory,
			canGoBack,
			actions: {
				setTab,
				setActiveTab,
				goBack,
				selectEntity,
				deselectEntity,
				selectTrait,
				deselectTrait,
				setSelectedEntity,
			},
		}),
		[
			activeTab,
			selectedEntity,
			selectedTrait,
			navHistory,
			canGoBack,
			setTab,
			setActiveTab,
			goBack,
			selectEntity,
			deselectEntity,
			selectTrait,
			deselectTrait,
			setSelectedEntity,
		]
	);
}
