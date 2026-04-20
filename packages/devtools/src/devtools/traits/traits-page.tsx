import { $internal, type Trait } from '@koota/core';
import type { Entity } from '@koota/core';
import { useEffect, useState } from 'react';
import type { Editor, TraitWithDebug } from '../../types';
import { resolveTraitById } from '../shared/trait-utils';
import { TraitDetail } from './trait-detail';
import { TraitList, type TypeFilters } from './trait-list';

interface TraitsPageProps {
	traits: Trait[];
	editor: Editor;
	selectedTrait: TraitWithDebug | null;
	onSelectTrait: (trait: TraitWithDebug) => void;
	onSelectEntity: (entity: Entity) => void;
	initialTypeFilters?: TypeFilters;
}

export function TraitsPage({
	traits,
	editor,
	selectedTrait,
	onSelectTrait,
	onSelectEntity,
	initialTypeFilters,
}: TraitsPageProps) {
	const [selectedTraitId, setSelectedTraitId] = useState<number | null>(
		selectedTrait?.[$internal]?.id ?? null
	);

	useEffect(() => {
		setSelectedTraitId(selectedTrait?.[$internal]?.id ?? null);
	}, [selectedTrait]);

	const activeTrait = resolveTraitById(traits, selectedTraitId);

	if (activeTrait) {
		return (
			<TraitDetail
				key={activeTrait[$internal].id}
				trait={activeTrait}
				editor={editor}
				onSelectEntity={onSelectEntity}
			/>
		);
	}

	return (
		<TraitList
			traits={traits}
			onSelect={(trait) => {
				setSelectedTraitId(trait[$internal].id);
				onSelectTrait(trait);
			}}
			initialTypeFilters={initialTypeFilters}
		/>
	);
}
