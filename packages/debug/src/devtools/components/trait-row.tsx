import type { Trait, World } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import { useTraitEntityCount } from '../hooks/use-trait-entity-count';
import styles from '../styles.module.css';
import { Row, RowCount, RowName } from './row';
import { getTraitName, getTraitType } from './trait-utils';

const badgeClasses: Record<string, string> = {
	tag: `${styles.badge} ${styles.badgeTag}`,
	soa: `${styles.badge} ${styles.badgeSoa}`,
	aos: `${styles.badge} ${styles.badgeAos}`,
	rel: `${styles.badge} ${styles.badgeRel}`,
};

interface TraitRowProps {
	world: World;
	trait: TraitWithDebug;
	onSelect: () => void;
}

export function TraitRow({ world, trait, onSelect }: TraitRowProps) {
	const entityCount = useTraitEntityCount(world, trait);

	const name = getTraitName(trait);
	const type = getTraitType(trait);

	return (
		<Row
			onClick={onSelect}
			title={
				trait.debugSource ? `${trait.debugSource.file}:${trait.debugSource.line}` : undefined
			}
		>
			<span className={badgeClasses[type]}>{type}</span>
			<RowName>{name}</RowName>
			<RowCount>{entityCount}</RowCount>
		</Row>
	);
}
