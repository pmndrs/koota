import type { Entity } from '@koota/core';
import { unpackEntity } from '@koota/core';
import styles from '../styles.module.css';

interface EntityRowProps {
	entity: Entity;
}

export function EntityRow({ entity }: EntityRowProps) {
	const { entityId, generation, worldId } = unpackEntity(entity);

	return (
		<div className={styles.entityRow}>
			<span className={styles.entityId}>{entityId}</span>
			<span className={styles.entityMeta}>
				gen:{generation} world:{worldId}
			</span>
			<span className={styles.entityRaw}>{entity}</span>
		</div>
	);
}
