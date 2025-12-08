import type { Entity } from '@koota/core';
import { unpackEntity } from '@koota/core';
import { IsDevtoolsHovered, IsDevtoolsHovering, IsDevtoolsHighlighting } from '../../traits';
import { useWorld } from '../hooks/use-world';
import { syncHighlightTags } from '../utils/sync-highlight-tags';
import styles from './entity-list.module.css';

interface EntityRowProps {
	entity: Entity;
	onSelect?: () => void;
}

export function EntityRow({ entity, onSelect }: EntityRowProps) {
	const world = useWorld();
	const { entityId, generation, worldId } = unpackEntity(entity);

	const handleMouseEnter = () => {
		if (world.has(entity)) {
			entity.add(IsDevtoolsHovered);
			world.add(IsDevtoolsHovering);
			world.add(IsDevtoolsHighlighting);
			syncHighlightTags(world);
		}
	};

	const handleMouseLeave = () => {
		if (world.has(entity)) {
			entity.remove(IsDevtoolsHovered);
			syncHighlightTags(world);
		}
	};

	return (
		<div
			className={`${styles.entityRow} ${onSelect ? styles.entityRowClickable : ''}`}
			onClick={onSelect}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<span className={styles.entityId}>{entityId}</span>
			<span className={styles.entityMeta}>
				gen:{generation} world:{worldId}
			</span>
			<span className={styles.entityRaw}>{entity}</span>
		</div>
	);
}
