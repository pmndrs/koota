import type { Entity } from '@koota/core';
import { useWorldEntities } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { VirtualList } from '../../ui/virtual-list';
import { EntityRow } from './entity-row';

interface EntityListProps {
  entities: Entity[];
  onSelect?: (entity: Entity) => void;
  emptyMessage?: string;
}

/** A virtualized list of entity rows. */
export function EntityList({ entities, onSelect, emptyMessage = 'No entities' }: EntityListProps) {
  return (
    <VirtualList
      items={entities}
      keyOf={(entity) => entity}
      renderRow={(entity) => <EntityRow entity={entity} onSelect={onSelect} />}
      emptyMessage={emptyMessage}
    />
  );
}

/** Every entity in the world, kept in sync with spawns and destroys. */
export function WorldEntityList({ onSelect }: { onSelect: (entity: Entity) => void }) {
  const world = useWorld();
  const entities = useWorldEntities(world);
  return <EntityList entities={entities} onSelect={onSelect} />;
}
