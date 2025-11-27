import type { Trait, World } from '@koota/core';
import { $internal } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import styles from '../styles.module.css';
import { TraitRow } from './trait-row';
import { getTraitName, getTraitType, type TraitType } from './trait-utils';

interface TraitListProps {
	world: World;
	traits: Trait[];
	filter: string;
	typeFilters: Record<TraitType, boolean>;
	onSelect: (trait: TraitWithDebug) => void;
}

export function TraitList({ world, traits, filter, typeFilters, onSelect }: TraitListProps) {
	const normalizedFilter = filter.trim().toLowerCase();
	const filtered = traits.filter((trait) => {
		const type = getTraitType(trait);
		if (typeFilters[type] === false) return false;
		if (!normalizedFilter) return true;
		const name = getTraitName(trait as TraitWithDebug).toLowerCase();
		return name.includes(normalizedFilter);
	});

	const sortedTraits = [...filtered].sort((a, b) => {
		const nameA = getTraitName(a as TraitWithDebug);
		const nameB = getTraitName(b as TraitWithDebug);
		return nameA.localeCompare(nameB);
	});

	if (sortedTraits.length === 0) {
		return <div className={styles.empty}>No traits registered</div>;
	}

	return (
		<>
			{sortedTraits.map((trait) => (
				<TraitRow
					key={(trait as TraitWithDebug)[$internal].id}
					world={world}
					trait={trait as TraitWithDebug}
					onSelect={() => onSelect(trait as TraitWithDebug)}
				/>
			))}
		</>
	);
}
