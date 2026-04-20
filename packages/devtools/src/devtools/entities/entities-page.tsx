import type { Entity } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import { AllEntitiesList } from './all-entities-list';
import { EntityDetail } from './entity-detail';

interface EntitiesPageProps {
	selectedEntity: Entity | null;
	onSelectEntity: (entity: Entity) => void;
	onSelectTrait: (trait: TraitWithDebug) => void;
}

export function EntitiesPage({ selectedEntity, onSelectEntity, onSelectTrait }: EntitiesPageProps) {
	if (selectedEntity !== null) {
		return (
			<EntityDetail
				key={selectedEntity}
				entity={selectedEntity}
				onSelectTrait={onSelectTrait}
			/>
		);
	}

	return <AllEntitiesList onSelect={onSelectEntity} />;
}
