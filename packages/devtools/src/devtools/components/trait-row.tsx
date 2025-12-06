import type { World } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import { useTraitEntityCount } from '../hooks/use-trait-entity-count';
import { formatDebugSourceTitle } from '../utils/debug-source';
import badgeStyles from './badge.module.css';
import { Row, RowCount, RowName } from './row';
import { getTraitName, getTraitSource, getTraitType } from './trait-utils';

const badgeClasses: Record<string, string> = {
	tag: `${badgeStyles.badge} ${badgeStyles.badgeTag}`,
	soa: `${badgeStyles.badge} ${badgeStyles.badgeSoa}`,
	aos: `${badgeStyles.badge} ${badgeStyles.badgeAos}`,
	rel: `${badgeStyles.badge} ${badgeStyles.badgeRel}`,
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
	const source = getTraitSource(trait);

	return (
		<Row
			onClick={onSelect}
			title={source ? formatDebugSourceTitle(source) : undefined}
		>
			<span className={badgeClasses[type]}>{type}</span>
			<RowName>{name}</RowName>
			<RowCount>{entityCount}</RowCount>
		</Row>
	);
}
