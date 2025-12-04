import type { Entity, World } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';
import styles from './trait-list.module.css';
import { AllEntityRow } from './all-entity-row';

interface AllEntitiesListProps {
	world: World;
	onSelect: (entity: Entity) => void;
}

export function AllEntitiesList({ world, onSelect }: AllEntitiesListProps) {
	const [entities, setEntities] = useState<Entity[]>(() => [...world.entities]);

	useEffect(() => {
		const updateEntities = () => setEntities([...world.entities]);

		world[$internal].entitySpawnedSubscriptions.add(updateEntities);
		world[$internal].entityDestroyedSubscriptions.add(updateEntities);

		return () => {
			world[$internal].entitySpawnedSubscriptions.delete(updateEntities);
			world[$internal].entityDestroyedSubscriptions.delete(updateEntities);
		};
	}, [world]);

	if (entities.length === 0) {
		return <div className={styles.empty}>No entities</div>;
	}

	return (
		<>
			{entities.map((entity) => (
				<AllEntityRow
					key={entity}
					world={world}
					entity={entity}
					onSelect={() => onSelect(entity)}
				/>
			))}
		</>
	);
}
