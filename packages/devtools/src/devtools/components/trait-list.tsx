import type { Trait } from '@koota/core';
import { $internal } from '@koota/core';
import { useMemo, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { useWorld } from '../hooks/use-world';
import styles from './trait-list.module.css';
import { TraitRow } from './trait-row';
import { getTraitName, getTraitType, type TraitType } from './trait-utils';

function getTraitEntityCount(world: any, trait: Trait): number {
	return world.query(trait).length;
}

interface TraitListProps {
	traits: Trait[];
	onSelect: (trait: TraitWithDebug) => void;
}

const typeClasses: Record<TraitType, string> = {
	tag: styles.typeTag,
	soa: styles.typeSoa,
	aos: styles.typeAos,
	rel: styles.typeRel,
};

export function TraitList({ traits, onSelect }: TraitListProps) {
	const world = useWorld();
	const [filter, setFilter] = useState('');
	const [showFilters, setShowFilters] = useState(false);
	const [typeFilters, setTypeFilters] = useState<Record<TraitType, boolean>>({
		tag: true,
		soa: true,
		aos: true,
		rel: true,
	});
	const [showEmpty, setShowEmpty] = useState(true);

	const toggleType = (type: TraitType) => {
		setTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
	};

	const activeFilterCount = useMemo(
		() => Object.values(typeFilters).filter((v) => !v).length,
		[typeFilters]
	);

	const normalizedFilter = filter.trim().toLowerCase();
	const sortedTraits = useMemo(() => {
		const filtered = traits.filter((trait) => {
			const type = getTraitType(trait);
			if (typeFilters[type] === false) return false;

			// Filter out empty traits unless showEmpty is true
			if (!showEmpty && getTraitEntityCount(world, trait) === 0) return false;

			if (!normalizedFilter) return true;
			const name = getTraitName(trait as TraitWithDebug).toLowerCase();
			return name.includes(normalizedFilter);
		});

		return [...filtered].sort((a, b) => {
			const nameA = getTraitName(a as TraitWithDebug);
			const nameB = getTraitName(b as TraitWithDebug);
			return nameA.localeCompare(nameB);
		});
	}, [normalizedFilter, showEmpty, traits, typeFilters, world]);

	return (
		<>
			<div className={styles.row}>
				<input
					type="text"
					placeholder="Filter…"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className={styles.input}
				/>
				<button
					className={`${styles.toggle} ${showFilters ? styles.toggleActive : ''}`}
					onClick={() => setShowFilters(!showFilters)}
					title="Filter by type"
				>
					<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
						<path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
					</svg>
					{activeFilterCount > 0 && <span className={styles.badge}>{activeFilterCount}</span>}
				</button>
			</div>
			{showFilters && (
				<div className={styles.types}>
					{(['tag', 'soa', 'aos', 'rel'] as const).map((type) => (
						<button
							key={type}
							className={`${styles.type} ${typeClasses[type]} ${
								typeFilters[type] ? styles.typeActive : ''
							}`}
							onClick={() => toggleType(type)}
						>
							{type}
						</button>
					))}
					<button
						className={`${styles.type} ${styles.typeEmpty} ${
							showEmpty ? styles.typeActive : ''
						}`}
						onClick={() => setShowEmpty(!showEmpty)}
						title="Show traits with 0 entities"
					>
						empty
					</button>
				</div>
			)}

			{sortedTraits.length === 0 ? (
				<div className={styles.empty}>
					{traits.length === 0 ? 'No traits registered' : 'No traits match filters'}
				</div>
			) : null}

			{sortedTraits.map((trait) => (
				<TraitRow
					key={(trait as TraitWithDebug)[$internal].id}
					trait={trait as TraitWithDebug}
					onSelect={() => onSelect(trait as TraitWithDebug)}
				/>
			))}
		</>
	);
}
