import type { World } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import { useTraitEntityCount } from '../hooks/use-trait-entity-count';
import { formatDebugSourceTitle } from '../utils/debug-source';
import { hasDebugSource } from '../utils/type-guards';
import badgeStyles from './badge.module.css';
import { Row, RowCount, RowName } from './row';
import { getTraitName, getTraitType } from './trait-utils';

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

	return (
		<Row
			onClick={onSelect}
			title={hasDebugSource(trait) ? formatDebugSourceTitle(trait.debugSource) : undefined}
		>
			<span className={badgeClasses[type]}>{type}</span>
			<RowName>{name}</RowName>
			<RowCount>{entityCount}</RowCount>
		</Row>
	);
}
