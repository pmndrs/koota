import type { Entity, World } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import styles from './all-entity-row.module.css';
import { Row, RowCount, RowName } from './row';

interface AllEntityRowProps {
	world: World;
	entity: Entity;
	onSelect: () => void;
}

export function AllEntityRow({ world, entity, onSelect }: AllEntityRowProps) {
	const { entityId, generation, worldId } = unpackEntity(entity);
	const traitCount = world[$internal].entityTraits.get(entity)?.size ?? 0;
	const isWorldEntity = entity === world[$internal].worldEntity;

	return (
		<Row onClick={onSelect}>
			<span className={styles.entityIdGroup}>
				<RowName>{isWorldEntity ? `World ${worldId}` : `Entity ${entityId}`}</RowName>
				{isWorldEntity && <span className={styles.worldBadge}>world</span>}
				<span className={styles.genBadge}>gen:{generation}</span>
			</span>
			<RowCount>{traitCount}</RowCount>
		</Row>
	);
}
