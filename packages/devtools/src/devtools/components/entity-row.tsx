import type { Entity } from '@koota/core';
import { unpackEntity } from '@koota/core';
import styles from './entity-list.module.css';

interface EntityRowProps {
	entity: Entity;
	onSelect?: () => void;
}

export function EntityRow({ entity, onSelect }: EntityRowProps) {
	const { entityId, generation, worldId } = unpackEntity(entity);

	return (
		<div
			className={`${styles.entityRow} ${onSelect ? styles.entityRowClickable : ''}`}
			onClick={onSelect}
		>
			<span className={styles.entityId}>{entityId}</span>
			<span className={styles.entityMeta}>
				gen:{generation} world:{worldId}
			</span>
			<span className={styles.entityRaw}>{entity}</span>
		</div>
	);
}
