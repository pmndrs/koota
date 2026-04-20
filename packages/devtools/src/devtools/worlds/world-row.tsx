import type { World } from '@koota/core';
import { Row, RowName, RowCount } from '../shared/row';
import { EntityIcon, TraitIcon, WorldIcon } from '../shared/icons';
import styles from './world-row.module.css';

interface WorldRowProps {
	world: World;
	onSelect: () => void;
}

export function WorldRow({ world, onSelect }: WorldRowProps) {
	const entityCount = world.entities.length;
	const traitCount = world.traits.size;

	return (
		<Row onClick={onSelect}>
			<WorldIcon size={12} className={styles.icon} />
			<span className={styles.meta}>
				<RowName>World {world.id}</RowName>
			</span>
			<span className={styles.stats}>
				<span className={styles.stat}>
					<EntityIcon size={9} className={styles.statIcon} />
					{entityCount}
				</span>
				<span className={styles.stat}>
					<TraitIcon size={9} className={styles.statIcon} />
					{traitCount}
				</span>
			</span>
		</Row>
	);
}
