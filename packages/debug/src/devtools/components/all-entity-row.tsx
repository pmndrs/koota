import type { Entity, World } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import styles from '../styles.module.css';
import { Row, RowCount, RowName } from './row';

interface AllEntityRowProps {
	world: World;
	entity: Entity;
}

export function AllEntityRow({ world, entity }: AllEntityRowProps) {
	const { entityId, generation } = unpackEntity(entity);
	const traitCount = world[$internal].entityTraits.get(entity)?.size ?? 0;

	return (
		<Row>
			<span className={styles.entityIdGroup}>
				<RowName>{entityId}</RowName>
				<span className={styles.genBadge}>gen:{generation}</span>
			</span>
			<RowCount>{traitCount}</RowCount>
			<span className={styles.entityRawSmall}>{entity}</span>
		</Row>
	);
}
