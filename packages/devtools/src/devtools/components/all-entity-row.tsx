import type { Entity } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import { IsDevtoolsHovered, IsDevtoolsHovering, IsDevtoolsHighlighting } from '../../traits';
import { useWorld } from '../hooks/use-world';
import { syncHighlightTags } from '../utils/sync-highlight-tags';
import styles from './all-entity-row.module.css';
import { Row, RowCount, RowName } from './row';

interface AllEntityRowProps {
	entity: Entity;
	onSelect: () => void;
}

export function AllEntityRow({ entity, onSelect }: AllEntityRowProps) {
	const world = useWorld();
	const { entityId, generation, worldId } = unpackEntity(entity);
	const traitCount = world[$internal].entityTraits.get(entity)?.size ?? 0;
	const isWorldEntity = entity === world[$internal].worldEntity;

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
		<Row onClick={onSelect} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
			<span className={styles.entityIdGroup}>
				<RowName>{isWorldEntity ? `World ${worldId}` : `Entity ${entityId}`}</RowName>
				{isWorldEntity && <span className={styles.worldBadge}>world</span>}
				<span className={styles.genBadge}>gen:{generation}</span>
			</span>
			<RowCount>{traitCount}</RowCount>
		</Row>
	);
}
