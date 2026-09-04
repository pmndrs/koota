import type { Entity } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';
import { useWorld } from '../hooks/use-world';
import styles from './trait-list.module.css';
import { AllEntityRow } from './all-entity-row';

interface AllEntitiesListProps {
  onSelect: (entity: Entity) => void;
}

export function AllEntitiesList({ onSelect }: AllEntitiesListProps) {
  const world = useWorld();
  const [entities, setEntities] = useState<Entity[]>(() => [...world.entities]);

  useEffect(() => {
    const updateEntities = () => setEntities([...world.entities]);

    world[$internal].entitySpawnSubscriptions.add(updateEntities);
    world[$internal].entityDestroySubscriptions.add(updateEntities);

    return () => {
      world[$internal].entitySpawnSubscriptions.delete(updateEntities);
      world[$internal].entityDestroySubscriptions.delete(updateEntities);
    };
  }, [world]);

  if (entities.length === 0) {
    return <div className={styles.empty}>No entities</div>;
  }

  return (
    <>
      {entities.map((entity) => (
        <AllEntityRow key={entity} entity={entity} onSelect={() => onSelect(entity)} />
      ))}
    </>
  );
}
